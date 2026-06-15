-- Project Dashboard 정규화 스키마 (v2)
-- Supabase SQL Editor에서 실행. 기존 boards 테이블은 건드리지 않음(롤백+레거시 보존).

create extension if not exists moddatetime;

create table if not exists workspaces (
  id          text primary key,
  name        text not null,
  position    float8 not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists workspace_canvas (
  workspace_id text primary key references workspaces(id) on delete cascade,
  scene        jsonb not null default '{}',
  notes        text  not null default '',
  updated_at   timestamptz not null default now()
);

create table if not exists phases (
  id           text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name         text not null,
  color        text,
  position     float8 not null default 0
);

create table if not exists projects (
  id           text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  phase_id     text references phases(id) on delete set null,
  title        text not null,
  descr        text not null default '',
  status       text not null default 'active'
               check (status in ('active','hold','done','archived')),
  position     float8 not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, workspace_id)            -- tasks의 복합 FK용
);

create table if not exists tasks (
  id             text primary key,
  workspace_id   text references workspaces(id) on delete cascade,
  project_id     text,
  title          text not null,
  notes          text not null default '',
  status         text not null default 'todo'
                 check (status in ('hold','todo','doing','done')),
  position       float8 not null default 0,     -- 상태 컬럼 내 순서
  scheduled_date date,                          -- 실행일 (do-date)
  deadline       date,                          -- 마감일 (due-date)
  today_section  text
                 check (today_section in ('morning','am','pm','evening')),
  today_position float8,
  checklist      jsonb not null default '[]',   -- [{id,title,done,children:[...]}]
  labels         jsonb not null default '[]',
  recurrence     jsonb,                         -- {freq,interval} | null
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  -- 비정규화 드리프트 방지: project_id가 null이면 FK 스킵(MATCH SIMPLE)
  foreign key (project_id, workspace_id)
    references projects (id, workspace_id) on delete cascade,
  check (today_section is null or scheduled_date is not null)
);

create index if not exists tasks_project_idx   on tasks (project_id);
create index if not exists tasks_ws_status_idx on tasks (workspace_id, status);
create index if not exists tasks_sched_idx     on tasks (scheduled_date) where status <> 'done';
create index if not exists tasks_deadline_idx  on tasks (deadline)        where status <> 'done';
create index if not exists tasks_inbox_idx     on tasks (created_at)      where project_id is null;

drop trigger if exists set_updated_at on workspaces;
create trigger set_updated_at before update on workspaces
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists set_updated_at on workspace_canvas;
create trigger set_updated_at before update on workspace_canvas
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists set_updated_at on projects;
create trigger set_updated_at before update on projects
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists set_updated_at on tasks;
create trigger set_updated_at before update on tasks
  for each row execute procedure moddatetime(updated_at);
