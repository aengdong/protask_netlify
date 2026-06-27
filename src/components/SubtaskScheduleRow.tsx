import { useState } from 'react'
import { Square, SquareCheckBig, CalendarDays, CornerDownRight } from 'lucide-react'
import { useStore, type ScheduledSubtask } from '../store/store'
import { daysFromToday, fmtDateShort } from '../lib/dates'
import ProjectChip from './ProjectChip'
import PlanPopover from './PlanPopover'

/** 서브태스크 날짜 칩 — 값 표시 + 클릭 시 PlanPopover(날짜만). 태스크/Today/Week 어디서나 재사용.
 *  date 없으면 hover/선택 시에만 노출(placeholder), 있으면 항상 표시. */
export function SubtaskDateChip({
  date, onApply, selected, align = 'right',
}: {
  date?: string | null
  onApply: (patch: { scheduled_date?: string | null }) => void
  selected?: boolean
  align?: 'right' | 'left'
}) {
  const [open, setOpen] = useState(false)
  const has = !!date
  let content = '날짜'
  let tone: 'overdue' | 'today' | 'future' | 'plan' = 'plan'
  if (date) {
    const d = daysFromToday(date)
    content = d === 0 ? '오늘' : d === 1 ? '내일' : fmtDateShort(date)
    tone = d < 0 ? 'overdue' : d === 0 ? 'today' : 'future'
  }
  const toneCls = {
    overdue: 'text-red-400 hover:bg-zinc-100 dark:text-red-400/90 dark:hover:bg-zinc-800',
    today: 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
    future: 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
    plan: 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
  }[tone]
  const vis = has ? '' : `group-hover:visible touch:visible ${selected ? 'visible' : 'invisible'}`

  return (
    <span className="relative shrink-0" onClick={e => e.stopPropagation()}>
      <button
        className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors ${toneCls} ${vis}`}
        title="날짜 변경"
        onClick={() => setOpen(o => !o)}
      >
        {!has && <CalendarDays size={12} className="shrink-0" />}
        <span>{content}</span>
      </button>
      {open && (
        <PlanPopover
          align={align}
          value={{ scheduled_date: date ?? null }}
          hideSomeday
          hideDeadline
          onApply={p => onApply({ scheduled_date: p.scheduled_date ?? null })}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  )
}

/** Today·이번주에서 '날짜가 배정된 서브태스크'를 부모 맥락과 함께 보여주는 경량 행.
 *  체크=완료 토글, 칩=재일정, 행 클릭=부모 태스크 상세 열기. */
export default function SubtaskScheduleRow({ item, compact }: { item: ScheduledSubtask; compact?: boolean }) {
  const toggleChecklistItem = useStore(s => s.toggleChecklistItem)
  const updateChecklistItem = useStore(s => s.updateChecklistItem)
  const openDetail = useStore(s => s.openDetail)
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 ${compact ? 'min-h-[34px] py-1' : 'min-h-[44px] py-1.5 md:min-h-[36px]'}`}
      onClick={() => openDetail(item.taskId)}
      title={`${item.taskTitle} ▸ ${item.title}`}
    >
      <button
        className={`shrink-0 ${item.done ? 'text-emerald-500' : 'text-zinc-300 hover:text-emerald-500 dark:text-zinc-600'}`}
        onClick={e => { e.stopPropagation(); toggleChecklistItem(item.id) }}
        title={item.done ? '완료 취소' : '완료'}
      >
        {item.done ? <SquareCheckBig size={16} /> : <Square size={16} />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={`truncate text-[14px] ${item.done ? 'text-zinc-400 line-through dark:text-zinc-500' : ''}`}>{item.title}</span>
        <span className="flex items-center gap-0.5 truncate text-[11px] text-zinc-400">
          <CornerDownRight size={10} className="shrink-0" />
          {item.taskTitle}
        </span>
      </div>
      {!compact && (item.workspace_id || item.project_id) && (
        <span className="shrink-0"><ProjectChip projectId={item.project_id} workspaceId={item.workspace_id} /></span>
      )}
      <SubtaskDateChip date={item.scheduled_date} onApply={p => updateChecklistItem(item.id, p)} />
    </div>
  )
}
