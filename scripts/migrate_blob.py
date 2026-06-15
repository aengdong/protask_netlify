# -*- coding: utf-8 -*-
"""
boards(blob) -> 정규화 테이블 마이그레이션 (멱등 — 결정적 id로 upsert, 재실행 안전)
- _index 행 -> workspaces
- 각 board 행: areas -> phases (id = "{ws}:{areaKey}"), projects -> projects, tasks -> tasks
- buckets 폐기, 태스크 순서는 상태별 그룹 후 index*1024
- status 매핑 외 값은 'todo' fallback + 로깅
- boards 테이블 무변경 (롤백/레거시 보존)
사용: python scripts/migrate_blob.py
"""
import json
import os
import sys
import urllib.request


def _load_env():
    """repo 루트 .env에서 VITE_SUPABASE_* 로드 (키는 커밋 금지 — .env에만)"""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    out = {}
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip()
    return out


_ENV = _load_env()
URL = os.environ.get("SUPABASE_URL") or _ENV.get("VITE_SUPABASE_URL") or ""
KEY = os.environ.get("SUPABASE_KEY") or _ENV.get("VITE_SUPABASE_ANON_KEY") or ""
if not URL or not KEY:
    print("ERROR: SUPABASE_URL/KEY 미설정 — .env(VITE_SUPABASE_*) 또는 환경변수 필요", file=sys.stderr)
    sys.exit(1)
REST = f"{URL}/rest/v1"
GAP = 1024

STATUS_MAP = {"hold": "hold", "todo": "todo", "doing": "doing", "done": "done",
              "backlog": "hold", "in_progress": "doing", "progress": "doing"}
PROJ_STATUS_MAP = {"todo": "active", "doing": "active", "hold": "hold", "done": "done"}

_ck_seq = 0


def req(method, path, body=None, prefer=None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(f"{REST}/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(r) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def upsert(table, rows):
    if not rows:
        return
    for i in range(0, len(rows), 200):
        req("POST", table, rows[i:i + 200], prefer="resolution=merge-duplicates,return=minimal")


def norm_ck(items, prefix):
    """checklist 정규화: text->title, id 없으면 결정적 생성"""
    global _ck_seq
    out = []
    for c in items or []:
        _ck_seq += 1
        cid = c.get("id") or f"{prefix}_ck{_ck_seq}"
        out.append({
            "id": cid,
            "title": c.get("title") or c.get("text") or "",
            "done": bool(c.get("done")),
            "children": norm_ck(c.get("children"), prefix),
        })
    return out


def main():
    boards = req("GET", "boards?select=id,data")
    by_id = {b["id"]: b.get("data") or {} for b in boards}

    index = by_id.get("_index", {})
    ws_list = index.get("workspaces") or []
    if not ws_list:
        print("ERROR: _index 행에 workspaces가 없음", file=sys.stderr)
        sys.exit(1)

    workspaces, phases, projects, tasks = [], [], [], []
    fallback_log = []

    for wi, ws in enumerate(ws_list):
        ws_id = ws["id"]
        workspaces.append({"id": ws_id, "name": ws["name"], "position": (wi + 1) * GAP})
        data = by_id.get(ws_id) or {}

        area_keys = []
        for ai, area in enumerate(data.get("areas") or []):
            key = area.get("key") or f"area{ai}"
            area_keys.append(key)
            phases.append({
                "id": f"{ws_id}:{key}",
                "workspace_id": ws_id,
                "name": area.get("name") or key,
                "color": None,
                "position": (ai + 1) * GAP,
            })

        # phase별 프로젝트 순서 카운터
        proj_pos = {}
        for proj in data.get("projects") or []:
            pid = proj.get("id")
            if not pid:
                continue
            area = proj.get("area")
            phase_id = f"{ws_id}:{area}" if area in area_keys else None
            k = phase_id or "__none"
            proj_pos[k] = proj_pos.get(k, 0) + 1
            raw_pstatus = proj.get("status") or "active"
            pstatus = PROJ_STATUS_MAP.get(raw_pstatus, "active")
            if raw_pstatus not in PROJ_STATUS_MAP and raw_pstatus != "active":
                fallback_log.append(f"project {pid}: status '{raw_pstatus}' -> active")
            projects.append({
                "id": pid,
                "workspace_id": ws_id,
                "phase_id": phase_id,
                "title": proj.get("title") or "프로젝트",
                "descr": proj.get("desc") or proj.get("descr") or "",
                "status": pstatus,
                "position": proj_pos[k] * GAP,
            })

            # 태스크: 상태별 그룹 후 인덱스 (전체 인덱스로 하면 컬럼 순서 섞임)
            by_status = {}
            for t in proj.get("tasks") or []:
                raw = t.get("status") or "todo"
                st = STATUS_MAP.get(raw)
                if st is None:
                    fallback_log.append(f"task {t.get('id')}: status '{raw}' -> todo")
                    st = "todo"
                by_status.setdefault(st, []).append(t)

            for st, lst in by_status.items():
                for ti, t in enumerate(lst):
                    tid = t.get("id") or f"{pid}_t{ti}"
                    due = (t.get("due") or "").strip() or None
                    tasks.append({
                        "id": tid,
                        "workspace_id": ws_id,
                        "project_id": pid,
                        "title": t.get("title") or "태스크",
                        "notes": t.get("desc") or "",
                        "status": st,
                        "position": (ti + 1) * GAP,
                        "scheduled_date": None,
                        "deadline": due,
                        "today_section": None,
                        "today_position": None,
                        "checklist": norm_ck(t.get("checklist"), tid),
                        "labels": [],
                        "recurrence": None,
                        "completed_at": None,
                    })

    # id 충돌 검사 (블롭은 워크스페이스 로컬 id — 전역 PK로 승격되므로)
    for name, rows in [("projects", projects), ("tasks", tasks)]:
        ids = [r["id"] for r in rows]
        dups = {i for i in ids if ids.count(i) > 1}
        if dups:
            print(f"ERROR: {name} id 충돌: {dups}", file=sys.stderr)
            sys.exit(1)

    upsert("workspaces", workspaces)
    upsert("phases", phases)
    upsert("projects", projects)
    upsert("tasks", tasks)

    print(f"workspaces={len(workspaces)} phases={len(phases)} projects={len(projects)} tasks={len(tasks)}")
    if fallback_log:
        print("-- fallback --")
        for line in fallback_log:
            print("  " + line)

    # 검증: blob 대비 행 수
    for ws in ws_list:
        data = by_id.get(ws["id"]) or {}
        blob_projects = len(data.get("projects") or [])
        blob_tasks = sum(len(p.get("tasks") or []) for p in data.get("projects") or [])
        got_p = req("GET", f"projects?workspace_id=eq.{ws['id']}&select=id")
        got_t = req("GET", f"tasks?workspace_id=eq.{ws['id']}&select=id")
        ok = "OK" if (len(got_p) == blob_projects and len(got_t) == blob_tasks) else "MISMATCH"
        print(f"[{ok}] {ws['id']}: projects {len(got_p)}/{blob_projects}, tasks {len(got_t)}/{blob_tasks}")


if __name__ == "__main__":
    main()
