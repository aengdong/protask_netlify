-- 0005_rls.sql — 비공개(단일 사용자) 모드
-- 로그인한(authenticated) 사용자만 접근 허용, anon(비로그인)은 거부.
-- 함께 필요한 것: 프론트 env VITE_REQUIRE_AUTH='true' + Supabase Auth에 Google 공급자 설정.
--   · 첫 로그인으로 본인 계정을 만든 뒤 Supabase Auth에서 신규 가입을 비활성화하면 단일 계정만 유지됩니다.
--   · service_role 키는 RLS를 우회하므로, MCP 서버(project_board_mcp_v2)의 SUPABASE_KEY는 service_role 키로 설정하세요.
-- 되돌리려면 각 테이블에 `alter table ... disable row level security;`.

alter table public.workspaces       enable row level security;
alter table public.phases           enable row level security;
alter table public.projects         enable row level security;
alter table public.tasks            enable row level security;
alter table public.today_sections   enable row level security;
alter table public.workspace_canvas enable row level security;

-- 단일 사용자라 행별 user_id 없이 "로그인했으면 전체 허용". anon은 정책이 없어 자동 거부.
drop policy if exists "authenticated full access" on public.workspaces;
drop policy if exists "authenticated full access" on public.phases;
drop policy if exists "authenticated full access" on public.projects;
drop policy if exists "authenticated full access" on public.tasks;
drop policy if exists "authenticated full access" on public.today_sections;
drop policy if exists "authenticated full access" on public.workspace_canvas;

create policy "authenticated full access" on public.workspaces       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.phases           for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.projects         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.tasks            for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.today_sections   for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.workspace_canvas for all to authenticated using (true) with check (true);
