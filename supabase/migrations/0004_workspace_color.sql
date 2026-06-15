-- 워크스페이스 사용자 지정 색상. null이면 팔레트에서 인덱스로 결정적 할당(fallback).
alter table workspaces add column if not exists color text;
