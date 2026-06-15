# -*- coding: utf-8 -*-
"""
Project Dashboard MCP v2 — 정규화 스키마(workspaces/phases/projects/tasks) 기반.
구 project_board_mcp.py(boards blob)와 별개 파일 — 레거시 팀보드는 그대로 유지.

ENV:
  SUPABASE_URL, SUPABASE_KEY (anon)
  DEFAULT_WORKSPACE_ID (기본 워크스페이스 — 예: ax-board)
"""
import json
import os
import time
import random
import string
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
DEFAULT_WS = os.environ.get("DEFAULT_WORKSPACE_ID", "ax-board")
REST = f"{SUPABASE_URL}/rest/v1"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

GAP = 1024
TASK_STATUSES = ("todo", "done")  # 칸반 백로그/진행중은 파생: someday=true / scheduled_date<=오늘
PROJECT_STATUSES = ("active", "hold", "done", "archived")
SECTIONS = ("morning", "am", "pm", "evening")

mcp = FastMCP("project-dashboard")


def _nid(prefix: str) -> str:
    chars = string.ascii_lowercase + string.digits
    return f"{prefix}_{''.join(random.choices(chars, k=12))}"


async def _get(path: str) -> Any:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{REST}/{path}", headers=HEADERS, timeout=30.0)
        r.raise_for_status()
        return r.json()


async def _post(table: str, rows: List[Dict]) -> None:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{REST}/{table}", headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows, timeout=30.0,
        )
        r.raise_for_status()


async def _patch(table: str, row_filter: str, payload: Dict) -> None:
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{REST}/{table}?{row_filter}", headers={**HEADERS, "Prefer": "return=minimal"},
            json=payload, timeout=30.0,
        )
        r.raise_for_status()


async def _delete(table: str, row_filter: str) -> None:
    async with httpx.AsyncClient() as c:
        r = await c.delete(f"{REST}/{table}?{row_filter}", headers={**HEADERS, "Prefer": "return=minimal"}, timeout=30.0)
        r.raise_for_status()


def _j(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S+09:00")


async def _next_position(table: str, flt: str) -> float:
    rows = await _get(f"{table}?{flt}&select=position&order=position.desc&limit=1")
    return (rows[0]["position"] if rows else 0) + GAP


def _ck_count(items: List[Dict], only_done: bool = False) -> int:
    n = 0
    for c in items or []:
        if not only_done or c.get("done"):
            n += 1
        n += _ck_count(c.get("children") or [], only_done)
    return n


def _task_summary(t: Dict) -> Dict:
    return {
        "id": t["id"], "title": t["title"], "status": t["status"],
        "project_id": t.get("project_id"), "workspace_id": t.get("workspace_id"),
        "scheduled_date": t.get("scheduled_date"), "deadline": t.get("deadline"), "someday": t.get("someday", False),
        "today_section": t.get("today_section"),
        "checklist": f"{_ck_count(t.get('checklist') or [], True)}/{_ck_count(t.get('checklist') or [])}",
        "notes": (t.get("notes") or "")[:120],
    }


# ───────────────────────── 워크스페이스 ─────────────────────────

@mcp.tool()
async def board_list_workspaces() -> str:
    """모든 워크스페이스 목록(id, name). 다른 도구의 workspace_id 인자로 사용."""
    rows = await _get("workspaces?select=id,name,position&order=position")
    return _j(rows)


@mcp.tool()
async def board_get_overview(workspace_id: Optional[str] = None) -> str:
    """워크스페이스 현황 요약: Phase·프로젝트·태스크 수, 상태 분포, 진행률(백로그 제외)."""
    ws = workspace_id or DEFAULT_WS
    projects = await _get(f"projects?workspace_id=eq.{ws}&select=id,title,status,phase_id&order=position")
    tasks = await _get(f"tasks?workspace_id=eq.{ws}&select=id,status,project_id,someday,scheduled_date")
    phases = await _get(f"phases?workspace_id=eq.{ws}&select=id,name&order=position")
    today = _today()
    dist = {"backlog": 0, "todo": 0, "doing": 0, "done": 0}
    for t in tasks:
        if t["status"] == "done":
            dist["done"] += 1
        elif t.get("someday"):
            dist["backlog"] += 1
        elif t.get("scheduled_date") and t["scheduled_date"] <= today:
            dist["doing"] += 1
        else:
            dist["todo"] += 1
    eligible = [t for t in tasks if not t.get("someday")]
    done = sum(1 for t in eligible if t["status"] == "done")
    return _j({
        "workspace": ws,
        "phases": len(phases),
        "projects": len(projects),
        "tasks": len(tasks),
        "status_dist": dist,
        "progress_pct": round(done / len(eligible) * 100) if eligible else 0,
        "project_list": [{"id": p["id"], "title": p["title"], "status": p["status"]} for p in projects],
    })


@mcp.tool()
async def board_get_overview_notes(workspace_id: Optional[str] = None) -> str:
    """워크스페이스 개요 노트(개요 탭 '프로젝트 노트', 마크다운) 조회."""
    ws = workspace_id or DEFAULT_WS
    rows = await _get(f"workspace_canvas?workspace_id=eq.{ws}&select=notes")
    return rows[0]["notes"] if rows else ""


@mcp.tool()
async def board_set_overview_notes(
    notes: str, workspace_id: Optional[str] = None, append: bool = False
) -> str:
    """워크스페이스 개요 노트(개요 탭 '프로젝트 노트', 마크다운) 작성/갱신.
    append=true면 기존 내용 뒤에 빈 줄을 두고 이어붙임. Excalidraw 캔버스(scene)는 보존된다."""
    ws = workspace_id or DEFAULT_WS
    final = notes
    if append:
        rows = await _get(f"workspace_canvas?workspace_id=eq.{ws}&select=notes")
        existing = rows[0]["notes"] if rows else ""
        final = f"{existing}\n\n{notes}" if existing else notes
    # scene은 페이로드에 넣지 않음 → PostgREST upsert는 ON CONFLICT 시 전달 컬럼만 갱신, 기존 scene 보존
    await _post("workspace_canvas", [{"workspace_id": ws, "notes": final, "updated_at": _now_iso()}])
    return _j({"workspace": ws, "appended": append, "length": len(final)})


# ───────────────────────── Phase ─────────────────────────

@mcp.tool()
async def board_list_phases(workspace_id: Optional[str] = None) -> str:
    """워크스페이스의 Phase 목록."""
    ws = workspace_id or DEFAULT_WS
    return _j(await _get(f"phases?workspace_id=eq.{ws}&select=*&order=position"))


@mcp.tool()
async def board_add_phase(name: str, workspace_id: Optional[str] = None) -> str:
    """Phase 추가."""
    ws = workspace_id or DEFAULT_WS
    pid = _nid("ph")
    pos = await _next_position("phases", f"workspace_id=eq.{ws}")
    await _post("phases", [{"id": pid, "workspace_id": ws, "name": name, "position": pos}])
    return _j({"created": {"id": pid, "name": name}})


@mcp.tool()
async def board_update_phase(phase_id: str, name: Optional[str] = None, color: Optional[str] = None) -> str:
    """Phase 수정(전달한 필드만)."""
    payload: Dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if color is not None:
        payload["color"] = color
    if not payload:
        return "Error: 변경할 필드 없음"
    await _patch("phases", f"id=eq.{phase_id}", payload)
    return _j({"updated": phase_id})


# ───────────────────────── 프로젝트 ─────────────────────────

@mcp.tool()
async def board_list_projects(workspace_id: Optional[str] = None, status: Optional[str] = None) -> str:
    """프로젝트 목록(+태스크 진행률)."""
    ws = workspace_id or DEFAULT_WS
    q = f"projects?workspace_id=eq.{ws}&select=*&order=position"
    if status:
        q += f"&status=eq.{status}"
    projects = await _get(q)
    tasks = await _get(f"tasks?workspace_id=eq.{ws}&select=id,status,project_id,someday")
    out = []
    for p in projects:
        pt = [t for t in tasks if t.get("project_id") == p["id"]]
        eligible = [t for t in pt if not t.get("someday")]
        done = sum(1 for t in eligible if t["status"] == "done")
        out.append({
            "id": p["id"], "title": p["title"], "status": p["status"], "phase_id": p.get("phase_id"),
            "descr": p.get("descr") or "",
            "tasks_total": len(pt), "tasks_done": done,
            "progress_pct": round(done / len(eligible) * 100) if eligible else 0,
        })
    return _j(out)


@mcp.tool()
async def board_get_project(project_id: str) -> str:
    """프로젝트 상세(모든 태스크 포함)."""
    rows = await _get(f"projects?id=eq.{project_id}&select=*")
    if not rows:
        return f"Error: 프로젝트 없음 — {project_id}"
    tasks = await _get(f"tasks?project_id=eq.{project_id}&select=*&order=status,position")
    p = rows[0]
    return _j({**p, "tasks": [_task_summary(t) for t in tasks]})


@mcp.tool()
async def board_add_project(title: str, workspace_id: Optional[str] = None, phase_id: Optional[str] = None,
                            descr: str = "") -> str:
    """프로젝트 추가."""
    ws = workspace_id or DEFAULT_WS
    pid = _nid("pr")
    flt = f"workspace_id=eq.{ws}" + (f"&phase_id=eq.{phase_id}" if phase_id else "&phase_id=is.null")
    pos = await _next_position("projects", flt)
    await _post("projects", [{
        "id": pid, "workspace_id": ws, "phase_id": phase_id, "title": title,
        "descr": descr, "status": "active", "position": pos,
    }])
    return _j({"created": {"id": pid, "title": title}})


@mcp.tool()
async def board_update_project(project_id: str, title: Optional[str] = None, descr: Optional[str] = None,
                               status: Optional[str] = None, phase_id: Optional[str] = None) -> str:
    """프로젝트 수정(전달한 필드만). status: active/hold/done/archived."""
    payload: Dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if descr is not None:
        payload["descr"] = descr
    if status is not None:
        if status not in PROJECT_STATUSES:
            return f"Error: status는 {PROJECT_STATUSES} 중 하나"
        payload["status"] = status
    if phase_id is not None:
        payload["phase_id"] = phase_id or None
    if not payload:
        return "Error: 변경할 필드 없음"
    await _patch("projects", f"id=eq.{project_id}", payload)
    return _j({"updated": project_id})


@mcp.tool()
async def board_delete_project(project_id: str) -> str:
    """프로젝트 삭제(태스크 CASCADE). 되돌릴 수 없음."""
    await _delete("projects", f"id=eq.{project_id}")
    return _j({"deleted": project_id})


# ───────────────────────── 태스크 ─────────────────────────

@mcp.tool()
async def board_list_tasks(workspace_id: Optional[str] = None, project_id: Optional[str] = None,
                           status: Optional[str] = None, search: Optional[str] = None, limit: int = 100) -> str:
    """태스크 조회. project_id 지정 시 워크스페이스 무관, search는 제목 부분일치."""
    q = "tasks?select=*&order=status,position"
    if project_id:
        q += f"&project_id=eq.{project_id}"
    else:
        q += f"&workspace_id=eq.{workspace_id or DEFAULT_WS}"
    if status:
        q += f"&status=eq.{status}"
    if search:
        q += f"&title=ilike.*{search}*"
    q += f"&limit={min(limit, 500)}"
    tasks = await _get(q)
    return _j({"count": len(tasks), "tasks": [_task_summary(t) for t in tasks]})


@mcp.tool()
async def board_add_task(title: str, project_id: Optional[str] = None, workspace_id: Optional[str] = None,
                         status: str = "todo", scheduled_date: Optional[str] = None,
                         deadline: Optional[str] = None, notes: str = "", someday: bool = False) -> str:
    """태스크 추가. project_id 지정 시 해당 프로젝트 칸반에, 둘 다 없으면 Inbox에.
    scheduled_date/deadline: YYYY-MM-DD."""
    if status not in TASK_STATUSES:
        return f"Error: status는 {TASK_STATUSES} 중 하나"
    ws = workspace_id
    if project_id:
        rows = await _get(f"projects?id=eq.{project_id}&select=workspace_id")
        if not rows:
            return f"Error: 프로젝트 없음 — {project_id}"
        ws = rows[0]["workspace_id"]
    tid = _nid("t")
    flt = (f"project_id=eq.{project_id}" if project_id else "project_id=is.null") + f"&status=eq.{status}"
    pos = await _next_position("tasks", flt)
    await _post("tasks", [{
        "id": tid, "workspace_id": ws, "project_id": project_id, "title": title, "notes": notes,
        "status": status, "position": pos, "scheduled_date": None if someday else scheduled_date, "deadline": deadline,
        "someday": someday, "checklist": [], "labels": [],
    }])
    return _j({"created": {"id": tid, "title": title, "project_id": project_id}})


@mcp.tool()
async def board_update_task(task_id: str, title: Optional[str] = None, status: Optional[str] = None,
                            scheduled_date: Optional[str] = None, deadline: Optional[str] = None,
                            notes: Optional[str] = None, project_id: Optional[str] = None,
                            clear_scheduled: bool = False, clear_deadline: bool = False,
                            someday: Optional[bool] = None) -> str:
    """태스크 수정(전달한 필드만). status: hold/todo/doing/done.
    날짜 제거는 clear_scheduled/clear_deadline=true."""
    payload: Dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if status is not None:
        if status not in TASK_STATUSES:
            return f"Error: status는 {TASK_STATUSES} 중 하나"
        payload["status"] = status
        payload["completed_at"] = _now_iso() if status == "done" else None
    if scheduled_date is not None:
        payload["scheduled_date"] = scheduled_date
        payload.setdefault("someday", False)  # 날짜 부여 = Someday 해제
    if someday is not None:
        payload["someday"] = someday
        if someday:
            payload["scheduled_date"] = None
            payload["today_section"] = None
            payload["today_position"] = None
    if clear_scheduled:
        payload["scheduled_date"] = None
        payload["today_section"] = None
        payload["today_position"] = None
    if deadline is not None:
        payload["deadline"] = deadline
    if clear_deadline:
        payload["deadline"] = None
    if notes is not None:
        payload["notes"] = notes
    if project_id is not None:
        rows = await _get(f"projects?id=eq.{project_id}&select=workspace_id")
        if not rows:
            return f"Error: 프로젝트 없음 — {project_id}"
        payload["project_id"] = project_id
        payload["workspace_id"] = rows[0]["workspace_id"]
    if not payload:
        return "Error: 변경할 필드 없음"
    await _patch("tasks", f"id=eq.{task_id}", payload)
    return _j({"updated": task_id, "fields": list(payload.keys())})


@mcp.tool()
async def board_delete_task(task_id: str) -> str:
    """태스크 삭제. 되돌릴 수 없음."""
    await _delete("tasks", f"id=eq.{task_id}")
    return _j({"deleted": task_id})


# ───────────────────────── 체크리스트(서브태스크) ─────────────────────────

def _walk_set(items: List[Dict], item_id: str, done: bool) -> bool:
    for c in items:
        if c.get("id") == item_id:
            c["done"] = done
            return True
        if _walk_set(c.get("children") or [], item_id, done):
            return True
    return False


@mcp.tool()
async def board_add_checklist_item(task_id: str, title: str, parent_item_id: Optional[str] = None) -> str:
    """태스크에 서브태스크(체크리스트 항목) 추가. parent_item_id로 중첩 가능."""
    rows = await _get(f"tasks?id=eq.{task_id}&select=checklist")
    if not rows:
        return f"Error: 태스크 없음 — {task_id}"
    ck = rows[0].get("checklist") or []
    item = {"id": _nid("ck"), "title": title, "done": False, "children": []}

    def insert(items: List[Dict]) -> bool:
        for c in items:
            if c.get("id") == parent_item_id:
                c.setdefault("children", []).append(item)
                return True
            if insert(c.get("children") or []):
                return True
        return False

    if parent_item_id:
        if not insert(ck):
            return f"Error: 상위 항목 없음 — {parent_item_id}"
    else:
        ck.append(item)
    await _patch("tasks", f"id=eq.{task_id}", {"checklist": ck})
    return _j({"created": item["id"], "title": title})


@mcp.tool()
async def board_check_item(task_id: str, item_id: str, done: bool = True) -> str:
    """서브태스크 체크/해제."""
    rows = await _get(f"tasks?id=eq.{task_id}&select=checklist")
    if not rows:
        return f"Error: 태스크 없음 — {task_id}"
    ck = rows[0].get("checklist") or []
    if not _walk_set(ck, item_id, done):
        return f"Error: 항목 없음 — {item_id}"
    await _patch("tasks", f"id=eq.{task_id}", {"checklist": ck})
    return _j({"item": item_id, "done": done})


# ───────────────────────── GTD ─────────────────────────

@mcp.tool()
async def board_capture(title: str, scheduled_date: Optional[str] = None) -> str:
    """빠른 캡처 — Inbox에 태스크 추가 (프로젝트·워크스페이스 미지정)."""
    tid = _nid("t")
    await _post("tasks", [{
        "id": tid, "workspace_id": None, "project_id": None, "title": title,
        "status": "todo", "position": GAP, "scheduled_date": scheduled_date,
        "checklist": [], "labels": [],
    }])
    return _j({"captured": {"id": tid, "title": title, "scheduled_date": scheduled_date}})


@mcp.tool()
async def board_inbox() -> str:
    """Inbox = 미분류(날짜 X·Someday X·미완료). 프로젝트 배정 여부와 무관."""
    tasks = await _get("tasks?scheduled_date=is.null&someday=is.false&status=neq.done&select=*&order=created_at.desc")
    return _j({"count": len(tasks), "tasks": [_task_summary(t) for t in tasks]})


@mcp.tool()
async def board_someday() -> str:
    """Someday(언젠가) 태스크 목록 — 칸반 백로그와 동일 집합."""
    tasks = await _get("tasks?someday=is.true&status=neq.done&select=*&order=created_at.desc")
    return _j({"count": len(tasks), "tasks": [_task_summary(t) for t in tasks]})


@mcp.tool()
async def board_today() -> str:
    """오늘 실행 예정 + 지연 태스크 (섹션·마감일 포함, 전체 워크스페이스)."""
    today = _today()
    todays = await _get(f"tasks?scheduled_date=eq.{today}&select=*&order=today_position")
    overdue = await _get(f"tasks?scheduled_date=lt.{today}&status=neq.done&select=*&order=scheduled_date")
    return _j({
        "date": today,
        "today": [_task_summary(t) for t in todays],
        "overdue": [{**_task_summary(t), "scheduled_date": t.get("scheduled_date")} for t in overdue],
    })


if __name__ == "__main__":
    mcp.run()
