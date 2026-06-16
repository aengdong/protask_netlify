import { useRef } from 'react'
import { useDialog } from '../store/dialogStore'

/** 앱 공용 prompt/confirm 모달 호스트 — App 루트에 1개 마운트 */
export default function DialogHost() {
  const current = useDialog(s => s.current)
  const close = useDialog(s => s.close)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!current) return null

  const cancel = () => {
    if (current.kind === 'prompt') current.resolve(null)
    else current.resolve(false)
    close()
  }
  const ok = () => {
    if (current.kind === 'prompt') current.resolve(inputRef.current?.value ?? '')
    else current.resolve(true)
    close()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 p-4 pt-[20vh] backdrop-blur-[1px]"
      onMouseDown={e => { if (e.target === e.currentTarget) cancel() }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); cancel() }
        else if (e.key === 'Enter' && current.kind === 'confirm') { e.stopPropagation(); ok() }
      }}
    >
      <div className="animate-[panel-in_140ms_ease-out] w-full max-w-[380px] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{current.title}</h2>
        {current.message && (
          <p className="mt-1.5 text-[13px] whitespace-pre-line text-zinc-500 dark:text-zinc-400">{current.message}</p>
        )}
        {current.kind === 'prompt' && (
          <input
            ref={inputRef}
            autoFocus
            className="input mt-3"
            defaultValue={current.defaultValue}
            placeholder={current.placeholder}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok() } }}
            onFocusCapture={e => e.currentTarget.select()}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn !px-3" onClick={cancel}>취소</button>
          <button
            autoFocus={current.kind === 'confirm'}
            className={current.kind === 'confirm' && current.danger
              ? 'btn !border-red-600 !bg-red-600 !px-3 !text-white hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-500'
              : 'btn btn-primary !px-3'}
            onClick={ok}
          >
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
