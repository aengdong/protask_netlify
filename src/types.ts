export type TaskStatus = 'todo' | 'done'
export type ProjectStatus = 'active' | 'hold' | 'done' | 'archived'

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['active', 'hold', 'done', 'archived']
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '진행',
  hold: '보류',
  done: '완료',
  archived: '보관',
}
export const PROJECT_STATUS_DOT: Record<ProjectStatus, string> = {
  active: 'bg-blue-500',
  hold: 'bg-zinc-400',
  done: 'bg-emerald-500',
  archived: 'bg-zinc-300 dark:bg-zinc-600',
}

/**
 * 칸반 컬럼은 별도 상태가 아니라 GTD 상태의 파생 투영:
 * backlog = Someday / doing = 실행일 ≤ 오늘 / todo = 그외 미완료 / done = 완료
 */
export type KanbanCol = 'backlog' | 'todo' | 'doing' | 'done'
export const KANBAN_ORDER: KanbanCol[] = ['backlog', 'todo', 'doing', 'done']
export const KANBAN_LABEL: Record<KanbanCol, string> = {
  backlog: '백로그',
  todo: '시작전',
  doing: '진행중',
  done: '완료',
}
export const KANBAN_DOT: Record<KanbanCol, string> = {
  backlog: 'bg-violet-400',
  todo: 'bg-zinc-400',
  doing: 'bg-amber-400',
  done: 'bg-emerald-500',
}

/** Today 시간대 섹션 — 사용자 정의 (today_sections 테이블) */
export interface Section {
  id: string
  name: string
  position: number
}

export interface Workspace {
  id: string
  name: string
  /** 사용자 지정 색상(hex). null이면 팔레트에서 인덱스로 결정 */
  color: string | null
  position: number
}

export interface Phase {
  id: string
  workspace_id: string
  name: string
  color: string | null
  position: number
}

export interface Project {
  id: string
  workspace_id: string
  phase_id: string | null
  title: string
  descr: string
  status: ProjectStatus
  position: number
}

export interface ChecklistItem {
  id: string
  title: string
  done: boolean
  children: ChecklistItem[]
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
}

export interface Task {
  id: string
  workspace_id: string | null
  project_id: string | null
  title: string
  notes: string
  status: TaskStatus
  /** Someday(언젠가) — 날짜 없이 의도적으로 미뤄둔 태스크. 칸반 백로그와 동일 */
  someday: boolean
  /** 중요 표시 — 우선순위 상/중/하 대신 중요/보통만 구분, 중요는 강조 표시 */
  important: boolean
  position: number
  scheduled_date: string | null
  deadline: string | null
  today_section: string | null
  today_position: number | null
  checklist: ChecklistItem[]
  labels: string[]
  recurrence: Recurrence | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface WorkspaceCanvas {
  workspace_id: string
  scene: Record<string, unknown>
  notes: string
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '시작전',
  done: '완료',
}

/* 워크스페이스 식별 색 — 사용자 지정 color 우선, 없으면 팔레트에서 인덱스로 결정 */
export const WS_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#ea580c', '#db2777', '#0891b2', '#65a30d', '#9333ea', '#dc2626', '#0284c7', '#ca8a04', '#475569']
export function paletteColor(idx: number): string {
  return WS_PALETTE[(idx < 0 ? 0 : idx) % WS_PALETTE.length]
}
export function wsColor(wsId: string | null, workspaces: Workspace[]): string {
  if (!wsId) return '#71717a'
  const ws = workspaces.find(w => w.id === wsId)
  if (ws?.color) return ws.color
  const idx = workspaces.findIndex(w => w.id === wsId)
  return paletteColor(idx)
}
