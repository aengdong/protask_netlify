import { create } from 'zustand'
import {
  connect as gcalConnect, disconnect as gcalDisconnect, fetchCalendars, fetchEventsRange,
  rescheduleEvent, gcalEnabled, hasValidToken, type GcalCalendar, type GcalEvent,
} from '../lib/gcal'

export type GcalStatus = 'disabled' | 'loading' | 'connected' | 'disconnected' | 'api_disabled' | 'error'

const LS_SEL = 'pd-gcal-selected'

function loadSelected(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_SEL)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

interface GcalStore {
  status: GcalStatus
  errDetail: string
  calendars: GcalCalendar[]
  /** null = 전체 표시, 배열 = 해당 캘린더만 */
  selected: string[] | null
  events: GcalEvent[]
  loadedKeys: string[]

  init: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => void
  /** [fromDate, toDate) — YYYY-MM-DD. 이미 로드한 범위는 스킵 */
  ensureRange: (fromDate: string, toDate: string) => Promise<void>
  refresh: () => Promise<void>
  /** 일정을 다른 날짜로 이동(구글에 쓰기). 낙관적 갱신 후 실패 시 롤백 */
  reschedule: (ev: GcalEvent, newDate: string) => Promise<void>
  setSelected: (ids: string[] | null) => void
  /** 선택 필터 적용된 특정 날짜 일정 */
  eventsOn: (date: string) => GcalEvent[]
}

let initOnce = false

export const useGcal = create<GcalStore>((set, get) => ({
  status: gcalEnabled ? (hasValidToken() ? 'loading' : 'disconnected') : 'disabled',
  errDetail: '',
  calendars: [],
  selected: loadSelected(),
  events: [],
  loadedKeys: [],

  init: async () => {
    if (!gcalEnabled || initOnce) return
    initOnce = true
    if (!hasValidToken()) {
      set({ status: 'disconnected' })
      return
    }
    const r = await fetchCalendars()
    if (r.ok) set({ calendars: r.calendars, status: 'connected' })
    else set({ status: r.reason === 'auth' ? 'disconnected' : r.reason, errDetail: r.detail ?? '' })
  },

  connect: async () => {
    if (!(await gcalConnect())) return
    const r = await fetchCalendars()
    if (r.ok) set({ calendars: r.calendars, status: 'connected', events: [], loadedKeys: [] })
    else set({ status: r.reason === 'auth' ? 'disconnected' : r.reason, errDetail: r.detail ?? '' })
  },

  disconnect: () => {
    gcalDisconnect()
    set({ status: 'disconnected', events: [], loadedKeys: [], calendars: [] })
  },

  ensureRange: async (fromDate, toDate) => {
    const s = get()
    if (s.status !== 'connected' || !s.calendars.length) return
    const key = `${fromDate}..${toDate}`
    if (s.loadedKeys.includes(key)) return
    set({ loadedKeys: [...s.loadedKeys, key] })
    const r = await fetchEventsRange(`${fromDate}T00:00:00+09:00`, `${toDate}T00:00:00+09:00`, s.calendars)
    if (!r.ok) {
      set({
        status: r.reason === 'auth' ? 'disconnected' : r.reason,
        errDetail: r.detail ?? '',
        loadedKeys: get().loadedKeys.filter(k => k !== key),
      })
      return
    }
    const cur = get().events
    const ids = new Set(cur.map(e => e.id))
    set({ events: [...cur, ...r.events.filter(e => !ids.has(e.id))] })
  },

  refresh: async () => {
    const keys = get().loadedKeys
    set({ events: [], loadedKeys: [] })
    for (const key of keys) {
      const [from, to] = key.split('..')
      await get().ensureRange(from, to)
    }
  },

  reschedule: async (ev, newDate) => {
    if (ev.date === newDate) return
    const prev = get().events
    const delta = Math.round((Date.parse(`${newDate}T12:00:00`) - Date.parse(`${ev.date}T12:00:00`)) / 86400000)
    // 낙관적: 날짜 + (시간일정이면) start/end도 평행 이동해 표시 일관성 유지
    set({
      events: prev.map(e => e.id === ev.id
        ? {
            ...e,
            date: newDate,
            start: e.allDay ? e.start : new Date(Date.parse(e.start) + delta * 86400000).toISOString(),
            end: e.allDay ? e.end : new Date(Date.parse(e.end) + delta * 86400000).toISOString(),
          }
        : e),
    })
    const r = await rescheduleEvent(ev, newDate)
    if (!r.ok) {
      set({
        events: prev, // 롤백
        status: r.reason === 'auth' ? 'disconnected' : r.reason === 'api_disabled' ? 'api_disabled' : get().status,
        errDetail: r.detail ?? '',
      })
    }
  },

  setSelected: ids => {
    try {
      if (ids === null) localStorage.removeItem(LS_SEL)
      else localStorage.setItem(LS_SEL, JSON.stringify(ids))
    } catch { /* ignore */ }
    set({ selected: ids })
  },

  eventsOn: date => {
    const { events, selected } = get()
    return events
      .filter(e => e.date === date && (selected === null || selected.includes(e.calendarId)))
      .sort((a, b) => Number(a.allDay ? 0 : 1) - Number(b.allDay ? 0 : 1) || a.start.localeCompare(b.start))
  },
}))
