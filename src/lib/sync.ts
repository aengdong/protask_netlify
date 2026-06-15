import { supabase } from './supabase'

/**
 * Outbox 동기화 레이어 (realtime 없음 — 1인용).
 * 낙관적 스토어 변경 후 변경 컬럼만 행 단위 PATCH를 직렬 flush.
 * 큐는 localStorage에 영속 — 오프라인/새로고침에도 유실 없음.
 */

type Table = 'workspaces' | 'workspace_canvas' | 'phases' | 'projects' | 'tasks' | 'today_sections'

export interface Op {
  table: Table
  kind: 'upsert' | 'update' | 'delete'
  rowId: string
  payload?: object
}

export type SyncStatus = 'idle' | 'saving' | 'offline' | 'error'

const LS_KEY = 'pd-outbox-v1'
let queue: Op[] = loadQueue()
let flushing = false
let inFlight: Op | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(s: SyncStatus, pending: number) => void>()

function loadQueue(): Op[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Op[]) : []
  } catch {
    return []
  }
}
function saveQueue() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(queue))
  } catch { /* quota — 무시 */ }
}

export function onSyncStatus(fn: (s: SyncStatus, pending: number) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify(s: SyncStatus) {
  listeners.forEach(fn => fn(s, queue.length))
}

const idCol = (table: Table) => (table === 'workspace_canvas' ? 'workspace_id' : 'id')

export function enqueue(op: Op) {
  if (op.kind === 'delete') {
    // 같은 행의 보류 중인 쓰기는 무의미 — 제거 후 delete 추가 (in-flight 제외)
    queue = queue.filter(q => !(q.table === op.table && q.rowId === op.rowId && q !== inFlight))
    queue.push(op)
  } else if (op.kind === 'update') {
    // 같은 행의 마지막 보류 op에 병합 (in-flight 제외)
    const last = queue[queue.length - 1]
    if (last && last !== inFlight && last.table === op.table && last.rowId === op.rowId && last.kind !== 'delete') {
      last.payload = { ...last.payload, ...op.payload }
    } else {
      queue.push(op)
    }
  } else {
    queue.push(op)
  }
  saveQueue()
  void flush()
}

async function exec(op: Op) {
  const col = idCol(op.table)
  if (op.kind === 'upsert') {
    const { error } = await supabase.from(op.table).upsert(op.payload as never)
    if (error) throw error
  } else if (op.kind === 'update') {
    const { error } = await supabase.from(op.table).update(op.payload as never).eq(col, op.rowId)
    if (error) throw error
  } else {
    const { error } = await supabase.from(op.table).delete().eq(col, op.rowId)
    if (error) throw error
  }
}

export async function flush(): Promise<void> {
  if (flushing) return
  flushing = true
  notify(queue.length ? 'saving' : 'idle')
  while (queue.length) {
    const op = queue[0]
    inFlight = op
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        await exec(op)
        ok = true
      } catch {
        if (!navigator.onLine) break
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    inFlight = null
    if (ok) {
      queue.shift()
      saveQueue()
    } else {
      // 보존 + 나중 재시도. 실패 시 refetch 금지(로컬 의도 보존).
      flushing = false
      notify(navigator.onLine ? 'error' : 'offline')
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => void flush(), 30_000)
      return
    }
  }
  flushing = false
  notify('idle')
}

export function pendingCount(): number {
  return queue.length
}

window.addEventListener('online', () => void flush())
// 부팅 시 잔여 큐 flush
void flush()
