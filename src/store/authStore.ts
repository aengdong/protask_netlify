import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { retryNow } from '../lib/sync'

/** 로그인 강제 여부 — 비공개 인스턴스에서만 'true'. 미설정 시 기존(무로그인) 동작 유지 */
export const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === 'true'

interface AuthState {
  session: Session | null
  ready: boolean
  signInGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>(() => ({
  session: null,
  ready: !REQUIRE_AUTH, // 인증 불필요 모드면 곧바로 준비완료로 취급
  signInGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  },
  signOut: async () => { await supabase.auth.signOut() },
}))

if (REQUIRE_AUTH) {
  void supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true })
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true })
    // 재로그인/토큰 자동갱신으로 세션이 생기면, 401로 멈춰 있던 쓰기를 즉시 재전송 → 빨간점 자가복구
    if (session) retryNow()
  })
}
