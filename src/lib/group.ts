import { bucketOf } from '../store/store'
import {
  BUCKET_LABEL, BUCKET_ORDER, paletteColor,
  type Bucket, type Phase, type Project, type Task,
} from '../types'

export type GroupBy = 'none' | 'status' | 'label' | 'project' | 'phase' | 'phase-project'

export interface TaskGroup {
  key: string
  label: string
  col?: Bucket
  /** label 그룹일 때 그 라벨 (add 시 부여) */
  label_value?: string
  /** project 그룹일 때 프로젝트 id (null=미분류). add 시 부여 */
  project_id?: string | null
  /** 그룹 색 점 (project 그룹) */
  color?: string
  tasks: Task[]
}

const byPos = (a: Task, b: Task) => a.position - b.position

/** 프로젝트 태스크에서 사용 중인 라벨 합집합 (정렬) */
export function collectLabels(tasks: Task[]): string[] {
  const set = new Set<string>()
  for (const t of tasks) for (const l of t.labels) set.add(l)
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** 그룹화 — status는 BUCKET_ORDER(미분류·오늘·예정·언젠가·완료) 순, label은 라벨별, project는 프로젝트별(+미분류), none은 단일 */
export function groupTasks(tasks: Task[], groupBy: GroupBy, projects: Project[] = [], phases: Phase[] = []): TaskGroup[] {
  if (groupBy === 'phase') {
    const projPhase = new Map(projects.map(p => [p.id, p.phase_id]))
    const ordered = [...phases].sort((a, b) => a.position - b.position)
    const groups: TaskGroup[] = ordered
      .map((ph, i) => ({ key: ph.id, label: ph.name, color: ph.color ?? paletteColor(i), tasks: tasks.filter(t => !!t.project_id && projPhase.get(t.project_id) === ph.id).sort(byPos) }))
      .filter(g => g.tasks.length)
    const none = tasks.filter(t => !t.project_id || !projPhase.get(t.project_id)).sort(byPos)
    if (none.length) groups.push({ key: '__none', label: '미분류', tasks: none })
    return groups
  }
  if (groupBy === 'project') {
    const ordered = [...projects].sort((a, b) => a.position - b.position)
    const groups: TaskGroup[] = ordered
      .map((p, i) => ({ key: p.id, label: p.title, project_id: p.id as string | null, color: paletteColor(i), tasks: tasks.filter(t => t.project_id === p.id).sort(byPos) }))
      .filter(g => g.tasks.length)
    const none = tasks.filter(t => !t.project_id).sort(byPos)
    if (none.length) groups.push({ key: '__none', label: '미분류', project_id: null, tasks: none })
    return groups
  }
  if (groupBy === 'status') {
    return BUCKET_ORDER.map(col => ({
      key: col,
      label: BUCKET_LABEL[col],
      col,
      tasks: tasks.filter(t => bucketOf(t) === col).sort(byPos),
    }))
  }
  if (groupBy === 'label') {
    const groups: TaskGroup[] = collectLabels(tasks).map(l => ({
      key: l,
      label: l,
      label_value: l,
      tasks: tasks.filter(t => t.labels.includes(l)).sort(byPos),
    }))
    const none = tasks.filter(t => t.labels.length === 0).sort(byPos)
    if (none.length) groups.push({ key: '__none', label: '라벨 없음', tasks: none })
    return groups
  }
  return [{ key: '__all', label: '전체', tasks: [...tasks].sort(byPos) }]
}

/** 체크리스트 노드 수 (재귀). onlyDone=true면 완료만 */
export function countCk(items: { done: boolean; children: unknown[] }[], onlyDone = false): number {
  let n = 0
  for (const c of items) {
    if (!onlyDone || c.done) n++
    n += countCk(c.children as { done: boolean; children: unknown[] }[], onlyDone)
  }
  return n
}
