-- 0003: GTD 개편 — Someday 도입, 태스크 상태 2종(todo/done)으로 단순화
-- 칸반 백로그/진행중은 파생: backlog = someday=true, doing = scheduled_date <= 오늘

alter table tasks add column if not exists someday boolean not null default false;

-- 기존 데이터 마이그레이션: hold(백로그) → Someday, doing(진행중) → 오늘 실행일
update tasks set someday = true,  status = 'todo' where status = 'hold';
update tasks set status = 'todo', scheduled_date = coalesce(scheduled_date, current_date) where status = 'doing';

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('todo','done'));
