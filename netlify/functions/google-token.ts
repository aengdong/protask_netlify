import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

// CORS 허용 출처: APP_ORIGINS(쉼표 구분) env로 제한, 미설정 시 요청 출처를 그대로 반영
const ALLOWLIST = (process.env.APP_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const origin = event.headers.origin ?? ''
  const allowed = ALLOWLIST.length ? ALLOWLIST.includes(origin) : !!origin

  const corsHeaders = allowed ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } : {}

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'method_not_allowed' }) }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'server_env_missing' }) }
  }

  const { action, code, refresh_token } = JSON.parse(event.body ?? '{}') as {
    action?: string; code?: string; refresh_token?: string
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret })

  if (action === 'exchange' && code) {
    params.set('grant_type', 'authorization_code')
    params.set('code', code)
    params.set('redirect_uri', 'postmessage')
  } else if (action === 'refresh' && refresh_token) {
    params.set('grant_type', 'refresh_token')
    params.set('refresh_token', refresh_token)
  } else {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'bad_request' }) }
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await r.json() as Record<string, unknown>

  if (!r.ok) {
    return {
      statusCode: r.status,
      headers: corsHeaders,
      body: JSON.stringify({ error: data.error, error_description: data.error_description }),
    }
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token ?? null,
    }),
  }
}
