-- 0006_task_important.sql — 태스크 중요도(중요/보통) 플래그
-- 우선순위 상/중/하 대신 "중요한 것"만 구분해 눈에 띄게 한다.
alter table public.tasks add column if not exists important boolean not null default false;
