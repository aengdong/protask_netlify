import { useMemo, useState, type ReactNode } from 'react'
import { Plus, CalendarDays, Folder, CloudMoon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, closestCenter,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core'
import { useStore, selInbox, selSomeday, useNavOrder } from '../store/store'
import { parseQuick, daysFromToday, fmtDateShort } from '../lib/dates'
import type { Task } from '../types'
import TaskRow from '../components/TaskRow'

/** 인식된 실행일을 짧은 라벨로 (오늘/내일/모레/M·d) */
function dateLabel(d: string): string {
  const n = daysFromToday(d)
  return n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : fmtDateShort(d)
}

/** 드래그 가능한 태스크 래퍼 — 거리 임계로 클릭(상세 열기)은 통과, 끌면 이동 */
function DragTask({ task }: { task: Task }) {
  const openDetail = useStore(s => s.openDetail)
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-40' : ''}>
      <TaskRow task={task} onOpen={openDetail} />
    </div>
  )
}

/** 드롭 영역 — Inbox / Someday */
function DropColumn({ id, active, className, children }: { id: 'inbox' | 'someday'; active: boolean; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl ring-2 transition-colors ${className ?? ''} ${
        isOver ? 'bg-blue-50/70 ring-blue-400/70 dark:bg-blue-950/30' : active ? 'ring-zinc-200/70 dark:ring-zinc-800/70' : 'ring-transparent'
      }`}
    >
      {children}
    </div>
  )
}

export default function InboxPage() {
  const inbox = useStore(useShallow(selInbox))
  const someday = useStore(useShallow(selSomeday))
  const workspaces = useStore(s => s.workspaces)
  const addTask = useStore(s => s.addTask)
  const updateTask = useStore(s => s.updateTask)
  const [text, setText] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [sdOpen, setSdOpen] = useState(() => localStorage.getItem('pd-inbox-someday') !== '0')
  const toggleSd = () => setSdOpen(o => { localStorage.setItem('pd-inbox-someday', o ? '0' : '1'); return !o })
  const sdVisible = sdOpen || dragId != null // 접혀 있어도 드래그 중엔 드롭존 노출

  const parsed = parseQuick(text)
  const submit = () => {
    if (!parsed.title) return
    addTask({ title: parsed.title, scheduled_date: parsed.date })
    setText('')
  }

  // 워크스페이스 단위로 그룹 (프로젝트는 행의 태그로만 표시). 미분류(워크스페이스 없음) 먼저.
  const { noWs, groups } = useMemo(() => {
    const noWs = inbox.filter(t => !t.workspace_id)
    const byWs = new Map<string, Task[]>()
    for (const t of inbox) {
      if (!t.workspace_id) continue
      if (!byWs.has(t.workspace_id)) byWs.set(t.workspace_id, [])
      byWs.get(t.workspace_id)!.push(t)
    }
    const groups = workspaces
      .filter(w => byWs.has(w.id))
      .map(w => ({ ws: w, tasks: byWs.get(w.id)! }))
    return { noWs, groups }
  }, [inbox, workspaces])

  // 키보드 내비 순서 (화면 표시 순서 그대로 flat: Inbox → Someday) — Someday는 펼쳤을 때만
  useNavOrder(useMemo(
    () => [...noWs, ...groups.flatMap(g => g.tasks), ...(sdOpen ? someday : [])].map(t => t.id),
    [noWs, groups, sdOpen, someday],
  ))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  const collision: CollisionDetection = args => { const p = pointerWithin(args); return p.length ? p : closestCenter(args) }
  const dragTask = dragId ? [...inbox, ...someday].find(t => t.id === dragId) ?? null : null
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const overId = e.over?.id
    if (!overId) return
    if (overId === 'someday') updateTask(String(e.active.id), { someday: true })
    else if (overId === 'inbox') updateTask(String(e.active.id), { someday: false })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={e => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-5 lg:flex-row lg:items-start">
        {/* 왼쪽 — Inbox */}
        <DropColumn id="inbox" active={dragId != null} className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="mb-4 flex items-baseline gap-3 px-1">
              <h1 className="text-[19px] font-bold tracking-tight">Inbox</h1>
              <span className="text-[13.5px] font-medium text-zinc-400">{inbox.length}건</span>
            </div>

            {/* 빠른 입력 — 모바일에선 + 버튼(전역 캡처)으로 대체되므로 숨김 */}
            <div className="mb-4 hidden items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 md:flex dark:border-zinc-700 dark:bg-zinc-900">
              <Plus size={15} className="shrink-0 text-zinc-400" />
              <input
                data-capture
                className="h-9 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-zinc-400"
                placeholder="생각나는 것을 바로 입력 — Enter"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
              {parsed.date && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                  title={`인식된 실행일: ${parsed.date}`}
                >
                  <CalendarDays size={12} />
                  {dateLabel(parsed.date)}
                </span>
              )}
            </div>

            {noWs.length > 0 && (
              <section className="mb-4">
                {groups.length > 0 && <GroupHead label="미분류" count={noWs.length} />}
                {noWs.map(t => <DragTask key={t.id} task={t} />)}
              </section>
            )}

            {groups.map(({ ws, tasks }) => (
              <section key={ws.id} className="mb-4">
                <GroupHead label={ws.name} count={tasks.length} />
                {tasks.map(t => <DragTask key={t.id} task={t} />)}
              </section>
            ))}

            {inbox.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-[14px] text-zinc-400 dark:border-zinc-700">
                Inbox가 비었습니다 ✓
              </div>
            )}
          </div>
        </DropColumn>

        {/* 오른쪽 — Someday. 우측 드로어처럼 접고 펼친다(접으면 세로 탭, 드래그 중엔 자동 노출) */}
        <DropColumn id="someday" active={dragId != null} className={sdVisible ? 'lg:w-[500px] lg:shrink-0' : 'lg:w-[46px] lg:shrink-0'}>
          {sdVisible ? (
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 px-1">
                <CloudMoon size={15} className="shrink-0 text-zinc-400" />
                <h2 className="text-[16px] font-bold tracking-tight text-zinc-600 dark:text-zinc-300">Someday</h2>
                <span className="text-[12.5px] font-semibold text-zinc-400">{someday.length}</span>
                <button onClick={toggleSd} className="ml-auto rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="오른쪽으로 접기">
                  <ChevronRight size={17} />
                </button>
              </div>
              <div className="min-h-[120px] rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/30">
                {someday.length > 0
                  ? someday.map(t => <DragTask key={t.id} task={t} />)
                  : (
                    <div className="flex h-[110px] items-center justify-center px-4 text-center text-[13px] text-zinc-400">
                      {dragId ? '여기에 놓으면 Someday로 보관' : '언젠가 할 일을 여기로 끌어다 두세요'}
                    </div>
                  )}
              </div>
            </div>
          ) : (
            <button
              onClick={toggleSd}
              title="Someday 펼치기"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-2.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:bg-zinc-800/60 lg:min-h-[240px] lg:flex-col lg:py-4"
            >
              <ChevronDown size={16} className="shrink-0 lg:hidden" />
              <ChevronLeft size={16} className="hidden shrink-0 lg:block" />
              <CloudMoon size={15} className="shrink-0" />
              <span className="text-[13.5px] font-bold tracking-tight lg:[writing-mode:vertical-rl]">Someday</span>
              <span className="text-[12px] font-semibold text-zinc-400">{someday.length}</span>
            </button>
          )}
        </DropColumn>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragTask && (
          <div className="pointer-events-none max-w-[420px] rounded-md border border-blue-300 bg-white px-3 py-2 text-[14px] font-medium shadow-lg dark:border-blue-700 dark:bg-zinc-800">
            {dragTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function GroupHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-0.5 flex items-baseline gap-1.5 px-1.5">
      <Folder size={12} className="shrink-0 self-center text-zinc-400" />
      <span className="text-[13px] font-bold">{label}</span>
      <span className="text-[12px] font-semibold text-zinc-400">{count}</span>
    </div>
  )
}
