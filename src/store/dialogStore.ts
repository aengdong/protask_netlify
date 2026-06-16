import { create } from 'zustand'

/** 네이티브 prompt/confirm 대체 — 앱 디자인에 맞는 모달. 명령형 비동기 API. */
export type DialogReq =
  | { kind: 'prompt'; title: string; message?: string; defaultValue: string; placeholder?: string; confirmLabel: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message?: string; confirmLabel: string; danger?: boolean; resolve: (v: boolean) => void }

interface DialogStore {
  current: DialogReq | null
  open: (r: DialogReq) => void
  close: () => void
}

export const useDialog = create<DialogStore>(set => ({
  current: null,
  open: r => set({ current: r }),
  close: () => set({ current: null }),
}))

/** 텍스트 입력 모달. 확인 시 입력값, 취소 시 null */
export function promptDialog(opts: {
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
}): Promise<string | null> {
  return new Promise(resolve => {
    useDialog.getState().open({
      kind: 'prompt',
      title: opts.title,
      message: opts.message,
      defaultValue: opts.defaultValue ?? '',
      placeholder: opts.placeholder,
      confirmLabel: opts.confirmLabel ?? '확인',
      resolve,
    })
  })
}

/** 확인 모달. 확인 시 true, 취소 시 false */
export function confirmDialog(opts: {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise(resolve => {
    useDialog.getState().open({
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? '확인',
      danger: opts.danger,
      resolve,
    })
  })
}
