/**
 * Google OAuth 토큰 프록시 (Vercel serverless).
 * client_secret은 서버 env에만 존재 — 클라이언트 번들에 노출되지 않음.
 *  POST {action:'exchange', code}            → access_token + refresh_token
 *  POST {action:'refresh', refresh_token}    → 새 access_token
 */
declare const process: { env: Record<string, string | undefined> }

// CORS 허용 출처: APP_ORIGINS(쉼표 구분) env로 제한, 미설정 시 요청 출처를 그대로 반영(포크 기본 동작).
const ALLOWLIST = (process.env.APP_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const origin = String(req.headers.origin ?? '')
  const allowed = ALLOWLIST.length ? ALLOWLIST.includes(origin) : !!origin
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'server_env_missing' })

  const { action, code, refresh_token } = (req.body ?? {}) as { action?: string; code?: string; refresh_token?: string }
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret })
  if (action === 'exchange' && code) {
    params.set('grant_type', 'authorization_code')
    params.set('code', code)
    params.set('redirect_uri', 'postmessage') // GIS popup code flow
  } else if (action === 'refresh' && refresh_token) {
    params.set('grant_type', 'refresh_token')
    params.set('refresh_token', refresh_token)
  } else {
    return res.status(400).json({ error: 'bad_request' })
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = (await r.json()) as Record<string, unknown>
  if (!r.ok) return res.status(r.status).json({ error: data.error, error_description: data.error_description })
  return res.status(200).json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token ?? null,
  })
}
