-- 0002: Today 섹션 사용자 정의화
-- 1) tasks.today_section 고정값(check) 제약 해제 → 자유 텍스트(섹션 id)
-- 2) today_sections 테이블 신설 (사용자가 직접 생성·수정·삭제)

alter table tasks drop constraint if exists tasks_today_section_check;

create table if not exists today_sections (
  id         text primary key,
  name       text not null,
  position   float8 not null default 0,
  created_at timestamptz not null default now()
);
