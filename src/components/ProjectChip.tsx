import { useStore } from '../store/store'
import { wsColor } from '../types'

/** GTD 뷰에서 태스크 소속(워크스페이스/프로젝트) 표시 칩 */
export default function ProjectChip({ projectId, workspaceId }: { projectId: string | null; workspaceId: string | null }) {
  const projects = useStore(s => s.projects)
  const workspaces = useStore(s => s.workspaces)
  if (!projectId && !workspaceId) return null
  const project = projectId ? projects.find(p => p.id === projectId) : null
  const wsId = project?.workspace_id ?? workspaceId
  const ws = workspaces.find(w => w.id === wsId)
  const color = wsColor(wsId ?? null, workspaces)
  const label = project ? project.title : (ws?.name ?? '')
  if (!label) return null
  return (
    <span
      className="inline-flex max-w-[140px] items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-px text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-400"
      title={ws && project ? `${ws.name} / ${project.title}` : label}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{label}</span>
    </span>
  )
}
