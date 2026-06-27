import { useEffect, useState } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ChecklistItem } from '../types'
import { nid } from '../store/store'

/* ───── 불변 트리 헬퍼 ───── */
function mapTree(items: ChecklistItem[], fn: (c: ChecklistItem) => ChecklistItem): ChecklistItem[] {
  return items.map(c => fn({ ...c, children: mapTree(c.children, fn) }))
}
function removeFromTree(items: ChecklistItem[], id: string): ChecklistItem[] {
  return items.filter(c => c.id !== id).map(c => ({ ...c, children: removeFromTree(c.children, id) }))
}
function insertChild(items: ChecklistItem[], parentId: string | null, item: ChecklistItem): ChecklistItem[] {
  if (parentId === null) return [...items, item]
  return items.map(c =>
    c.id === parentId ? { ...c, children: [...c.children, item] } : { ...c, children: insertChild(c.children, parentId, item) },
  )
}
function findParentId(items: ChecklistItem[], id: string, parent: string | null = null): string | null | undefined {
  for (const c of items) {
    if (c.id === id) return parent
    const r = findParentId(c.children, id, c.id)
    if (r !== undefined) return r
  }
  return undefined
}
function siblingsOf(items: ChecklistItem[], parentId: string | null): ChecklistItem[] {
  if (parentId === null) return items
  const stack = [...items]
  while (stack.length) {
    const c = stack.pop()!
    if (c.id === parentId) return c.children
    stack.push(...c.children)
  }
  return []
}
function findItem(items: ChecklistItem[], id: string): ChecklistItem | null {
  for (const c of items) { if (c.id === id) return c; const f = findItem(c.children, id); if (f) return f }
  return null
}
/** 같은 부모(형제) 안에서만 active를 over 위치로 재정렬. 형제가 아니면 null. */
function reorderSiblings(items: ChecklistItem[], activeId: string, overId: string): ChecklistItem[] | null {
  const ai = items.findIndex(c => c.id === activeId)
  const oi = items.findIndex(c => c.id === overId)
  if (ai !== -1 && oi !== -1) return arrayMove(items, ai, oi)
  for (let i = 0; i < items.length; i++) {
    const r = reorderSiblings(items[i].children, activeId, overId)
    if (r) { const next = [...items]; next[i] = { ...items[i], children: r }; return next }
  }
  return null
}

interface AddState {
  parentId: string | null
  text: string
}

interface RowCtx {
  items: ChecklistItem[]
  onChange: (next: ChecklistItem[]) => void
  add: AddState | null
  setAdd: (a: AddState | null) => void
  editing: { id: string; text: string } | null
  setEditing: (e: { id: string; text: string } | null) => void
  commitEdit: () => void
  commitAdd: (keepOpen: boolean) => void
  onAddKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/** 체크리스트 한 줄 — 드래그 핸들 + 체크박스 + 인라인 편집/추가/삭제 + 재귀 자식 */
function CkRow({ c, depth, ctx }: { c: ChecklistItem; depth: number; ctx: RowCtx }) {
  const { items, onChange, add, setAdd, editing, setEditing, commitEdit, commitAdd, onAddKey } = ctx
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })
  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, marginLeft: depth * 16 }}
        {...attributes}
        className={`group flex items-start gap-1 rounded px-1 py-[3px] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${isDragging ? 'opacity-40' : ''}`}
      >
        <button
          {...listeners}
          className="mt-[2px] shrink-0 cursor-grab touch-none text-zinc-300 opacity-0 group-hover:opacity-100 dark:text-zinc-600"
          title="끌어서 순서 변경"
        >
          <GripVertical size={13} />
        </button>
        <input
          type="checkbox"
          checked={c.done}
          onChange={() => onChange(mapTree(items, x => (x.id === c.id ? { ...x, done: !x.done } : x)))}
          className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-500"
        />
        {editing?.id === c.id ? (
          <input
            autoFocus
            className="input !py-0.5 !text-[14px]"
            value={editing.text}
            onChange={e => setEditing({ id: c.id, text: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <span
            className={`flex-1 cursor-text text-[14px] leading-[1.45] ${c.done ? 'text-zinc-400 line-through dark:text-zinc-500' : ''}`}
            onClick={() => setEditing({ id: c.id, text: c.title })}
          >
            {c.title}
          </span>
        )}
        <button
          className="shrink-0 rounded p-1 text-zinc-300 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          title="하위 항목 추가"
          onClick={() => setAdd({ parentId: c.id, text: '' })}
        >
          <Plus size={14} />
        </button>
        <button
          className="shrink-0 rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-600 dark:text-zinc-600 dark:hover:bg-red-950 dark:hover:text-red-400"
          title="삭제"
          onClick={() => onChange(removeFromTree(items, c.id))}
        >
          <X size={14} />
        </button>
      </div>
      {add?.parentId === c.id && (
        <div style={{ marginLeft: (depth + 1) * 16 }} className="py-0.5 pr-6">
          <input
            autoFocus
            className="input !py-1 !text-[14px]"
            placeholder="하위 항목 — Enter 추가 · Tab 들여쓰기 · Shift+Tab 내어쓰기"
            value={add.text}
            onChange={e => setAdd({ ...add, text: e.target.value })}
            onKeyDown={onAddKey}
            onBlur={() => commitAdd(false)}
          />
        </div>
      )}
      {c.children.length > 0 && <CkLevel list={c.children} depth={depth + 1} ctx={ctx} />}
    </div>
  )
}

/** 한 단계(형제 그룹) — 자체 SortableContext */
function CkLevel({ list, depth, ctx }: { list: ChecklistItem[]; depth: number; ctx: RowCtx }) {
  return (
    <SortableContext items={list.map(c => c.id)} strategy={verticalListSortingStrategy}>
      {list.map(c => <CkRow key={c.id} c={c} depth={depth} ctx={ctx} />)}
    </SortableContext>
  )
}

export default function Checklist({
  items,
  onChange,
  addSignal,
}: {
  items: ChecklistItem[]
  onChange: (next: ChecklistItem[]) => void
  /** 값이 바뀔 때마다 새 최상위 서브태스크 입력을 연다(예: 제목에서 Shift+Enter) */
  addSignal?: number
}) {
  const [add, setAdd] = useState<AddState | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // 외부 신호(Shift+Enter 등)로 최상위 추가 입력 열기 — 초기 0은 무시
  useEffect(() => {
    if (addSignal) setAdd({ parentId: null, text: '' })
  }, [addSignal])

  const commitAdd = (keepOpen: boolean) => {
    if (!add) return
    const text = add.text.trim()
    if (text) {
      onChange(insertChild(items, add.parentId, { id: nid('ck'), title: text, done: false, children: [] }))
    }
    setAdd(keepOpen ? { parentId: add.parentId, text: '' } : null)
  }

  const onAddKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!add) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitAdd(true)
    } else if (e.key === 'Escape') {
      setAdd(null)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        if (add.parentId === null) return
        const gp = findParentId(items, add.parentId)
        if (gp !== undefined) setAdd({ parentId: gp, text: add.text })
      } else {
        const sibs = siblingsOf(items, add.parentId)
        if (sibs.length > 0) setAdd({ parentId: sibs[sibs.length - 1].id, text: add.text })
      }
    }
  }

  const commitEdit = () => {
    if (!editing) return
    const text = editing.text.trim()
    if (text) onChange(mapTree(items, c => (c.id === editing.id ? { ...c, title: text } : c)))
    setEditing(null)
  }

  const ctx: RowCtx = { items, onChange, add, setAdd, editing, setEditing, commitEdit, commitAdd, onAddKey }
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const next = reorderSiblings(items, String(active.id), String(over.id))
    if (next) onChange(next)
  }
  const activeItem = activeId ? findItem(items, activeId) : null

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={e => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <CkLevel list={items} depth={0} ctx={ctx} />
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[14px] shadow-lg dark:border-blue-700 dark:bg-zinc-800">{activeItem.title}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {add?.parentId === null && (
        <div className="py-0.5 pr-6">
          <input
            autoFocus
            className="input !py-1 !text-[14px]"
            placeholder="서브태스크 — Enter 추가 · Tab 들여쓰기"
            value={add.text}
            onChange={e => setAdd({ ...add, text: e.target.value })}
            onKeyDown={onAddKey}
            onBlur={() => commitAdd(false)}
          />
        </div>
      )}
      {add === null && (
        <button
          onClick={() => setAdd({ parentId: null, text: '' })}
          className="mt-1 flex w-full items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 dark:hover:text-blue-400"
        >
          <Plus size={14} /> 서브태스크 추가
        </button>
      )}
    </div>
  )
}
