import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore, bucketOf, useNavOrder } from '../../store/store'
import { BUCKET_DOT, BUCKET_LABEL, BUCKET_ORDER, type Bucket, type Task } from '../../types'
import TaskRow from '../TaskRow'

/** 프로젝트 기본 뷰 — Inbox식 리스트. 5버킷(미분류·오늘·예정·언젠가·완료) 소제목으로 묶어 표시.
 *  상단 빠른 추가는 날짜·someday 없는 순수 inbox 태스크를 만든다(전역 Inbox에도 프로젝트 태그로 노출). */
export default function ProjectList({ tasks, projectId, wsId }: { tasks: Task[]; projectId: string; wsId: string }) {
  const addTask = useStore(s => s.addTask)
  const openDetail = useStore(s => s.openDetail)
  const [text, setText] = useState('')

  const submit = () => {
    const v = text.trim()
    if (!v) return
    addTask({ title: v, project_id: projectId, workspace_id: wsId }) // 순수 inbox(날짜·someday 없음)
    setText('')
  }

  const groups = useMemo(() => {
    const map = {} as Record<Bucket, Task[]>
    for (const c of BUCKET_ORDER) map[c] = []
    for (const t of tasks) map[bucketOf(t)].push(t)
    for (const c of BUCKET_ORDER) map[c].sort((a, b) => a.position - b.position)
    return BUCKET_ORDER.map(col => ({ col, tasks: map[col] })).filter(g => g.tasks.length)
  }, [tasks])

  useNavOrder(useMemo(() => groups.flatMap(g => g.tasks.map(t => t.id)), [groups]), 'task')

  return (
    <div className="mx-auto max-w-[760px] px-5 pb-8">
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900">
        <Plus size={15} className="shrink-0 text-zinc-400" />
        <input
          data-capture
          className="h-9 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-zinc-400"
          placeholder="이 프로젝트에 태스크 추가 — Enter"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
      </div>

      {groups.map(g => (
        <section key={g.col} className="mb-4">
          <div className="mb-0.5 flex items-baseline gap-1.5 px-1.5">
            <span className={`h-2 w-2 shrink-0 self-center rounded-full ${BUCKET_DOT[g.col]}`} />
            <span className="text-[12.5px] font-bold">{BUCKET_LABEL[g.col]}</span>
            <span className="text-[11.5px] font-semibold text-zinc-400">{g.tasks.length}</span>
          </div>
          {g.tasks.map(t => <TaskRow key={t.id} task={t} onOpen={openDetail} />)}
        </section>
      ))}

      {groups.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-[14px] text-zinc-400 dark:border-zinc-700">
          태스크가 없습니다 — 위 입력창에 추가하세요.
        </div>
      )}
    </div>
  )
}
