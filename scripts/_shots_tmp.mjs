// TEMP — capture Protask screenshots for blog post (demo data, no real DB).
// Outputs into the Obsidian vault's 99. Attachments. Delete after use.
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'http://localhost:5173'
const OUT = 'C:\\Users\\PC\\Documents\\Github\\Obsidian_Vault\\99. Attachments'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const D = new Date()
const iso = off => new Date(D.getTime() + off * 86400000).toISOString().slice(0, 10)
const now = D.toISOString()
const T = (id, project_id, title, o = {}) => ({
  id, workspace_id: 'ws1', project_id, title, notes: '', status: 'todo', someday: false,
  position: o.position ?? 1024, scheduled_date: null, deadline: null, today_section: null, today_position: null,
  checklist: o.checklist ?? [], labels: o.labels ?? [], recurrence: null,
  created_at: now, updated_at: now, completed_at: null, ...o,
})

const DB = {
  workspaces: [
    { id: 'ws1', name: 'Product', color: '#2563eb', position: 1024, created_at: now, updated_at: now },
    { id: 'ws2', name: 'Marketing', color: '#7c3aed', position: 2048, created_at: now, updated_at: now },
  ],
  phases: [
    { id: 'ph1', workspace_id: 'ws1', name: 'Phase 1 · Discovery', color: '#0d9488', position: 1024 },
    { id: 'ph2', workspace_id: 'ws1', name: 'Phase 2 · Build', color: '#2563eb', position: 2048 },
    { id: 'ph3', workspace_id: 'ws1', name: 'Phase 3 · Launch', color: '#ea580c', position: 3072 },
  ],
  projects: [
    { id: 'p1', workspace_id: 'ws1', phase_id: 'ph1', title: 'User research', descr: '', status: 'active', position: 1024 },
    { id: 'p2', workspace_id: 'ws1', phase_id: 'ph1', title: 'Design system', descr: '', status: 'active', position: 2048 },
    { id: 'p3', workspace_id: 'ws1', phase_id: 'ph2', title: 'Web app', descr: 'Core product surface', status: 'active', position: 1024 },
    { id: 'p4', workspace_id: 'ws1', phase_id: 'ph2', title: 'Mobile app', descr: '', status: 'active', position: 2048 },
    { id: 'p5', workspace_id: 'ws1', phase_id: 'ph2', title: 'Billing & payments', descr: '', status: 'hold', position: 3072 },
    { id: 'p6', workspace_id: 'ws1', phase_id: 'ph3', title: 'Marketing site', descr: '', status: 'active', position: 1024 },
    { id: 'p7', workspace_id: 'ws1', phase_id: 'ph3', title: 'Docs', descr: '', status: 'active', position: 2048 },
    { id: 'p8', workspace_id: 'ws2', phase_id: null, title: 'Q3 campaign', descr: '', status: 'active', position: 1024 },
  ],
  today_sections: [
    { id: 'sec_am', name: 'Morning', position: 1024 },
    { id: 'sec_pm', name: 'Afternoon', position: 2048 },
  ],
  tasks: [
    T('t1', 'p1', 'Interview 5 users', { scheduled_date: iso(0), today_section: 'sec_am', today_position: 1024 }),
    T('t2', 'p1', 'Synthesize findings', { scheduled_date: iso(0), today_section: 'sec_pm', today_position: 1024, checklist: [{ id: 'c1', title: 'Tag quotes', done: true, children: [] }, { id: 'c2', title: 'Affinity map', done: false, children: [] }] }),
    T('t3', 'p1', 'Persona draft', { someday: true }),
    T('t4', 'p2', 'Color & type tokens', { status: 'done', completed_at: now }),
    T('t5', 'p2', 'Component library', { scheduled_date: iso(0), today_position: 2048 }),
    T('t6', 'p2', 'Icon set', { scheduled_date: iso(2) }),
    T('t7', 'p3', 'Auth flow', { scheduled_date: iso(1), deadline: iso(3) }),
    T('t8', 'p3', 'Dashboard layout', { scheduled_date: iso(0), today_section: 'sec_am', today_position: 2048 }),
    T('t9', 'p3', 'Settings page', {}),
    T('t10', 'p3', 'Deploy pipeline', { someday: true }),
    T('t11', 'p4', 'Push notifications', { scheduled_date: iso(4) }),
    T('t12', 'p4', 'Offline mode', { labels: ['stretch'] }),
    T('t13', 'p5', 'Stripe integration', { scheduled_date: iso(1), deadline: iso(5) }),
    T('t14', 'p5', 'Invoice PDFs', {}),
    T('t15', 'p6', 'Landing page', { scheduled_date: iso(0), today_section: 'sec_pm', today_position: 2048 }),
    T('t16', 'p7', 'Quickstart guide', { scheduled_date: iso(6) }),
    T('t17', 'p8', 'Ad creatives', { scheduled_date: iso(2) }),
  ],
}

const shots = [
  ['protask-overview-table.png', '/w/ws1', { 'pd-wsview': 'table', 'pd-wsgroup': 'phase-project' }, 1500],
  ['protask-today-board.png', '/', { 'pd-todayview': 'board' }, 1500],
  ['protask-project-board.png', '/w/ws1/p/p3', { 'pd-projview': 'board' }, 1500],
  ['protask-upcoming.png', '/upcoming', {}, 1500],
  ['protask-calendar.png', '/calendar', {}, 1600],
  ['protask-dark-board.png', '/w/ws1/p/p3', { 'pd-projview': 'board', 'pd-theme': 'dark' }, 1500],
]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 })
await page.setRequestInterception(true)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }
page.on('request', req => {
  const u = req.url()
  if (u.includes('/rest/v1/')) {
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
    const table = u.split('/rest/v1/')[1].split('?')[0]
    const single = (req.headers()['accept'] || '').includes('pgrst.object')
    let data = DB[table] ?? []
    if (single) data = data[0] ?? null
    return req.respond({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  }
  req.continue().catch(() => {})
})

for (const [file, path, prefs, wait] of shots) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(p => { localStorage.clear(); for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v) }, prefs)
  await page.goto(BASE + path, { waitUntil: 'networkidle2' })
  await sleep(wait)
  await page.screenshot({ path: `${OUT}\\${file}` })
  console.log('shot', file)
}

await browser.close()
console.log('done')
