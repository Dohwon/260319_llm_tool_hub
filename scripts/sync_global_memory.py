#!/usr/bin/env python3
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PROFILE_PATH = ROOT / "global_memory" / "memory_profile.json"
PROJECTS_PATH = ROOT / "data" / "projects.json"
BRIEF_PATH = Path("/home/dowon/securedir/git/codex/dowon_manager_agent_brief.md")
ADAPTER_DIR = ROOT / "global_memory" / "adapters"
EXPORT_DIR = ROOT / "global_memory" / "exports"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def render_shared_markdown(profile: dict, projects: dict, brief_text: str) -> str:
    communication = "\n".join(f"- {item}" for item in profile["user_profile"]["communication_style"])
    working = "\n".join(f"- {item}" for item in profile["user_profile"]["working_style"])
    technical = "\n".join(f"- {item}" for item in profile["user_profile"]["technical_preferences"])
    focus = "\n".join(f"- {item}" for item in profile["current_focus"])
    project_rows = "\n".join(
        f"- {project['name']} | {project['status']} | {project['runtime']} | {project['location']}"
        for project in projects["projects"]
    )
    brief_excerpt = brief_text.strip().splitlines()[:28]
    brief_block = "\n".join(brief_excerpt)
    return f"""# Shared Source of Truth

## User Snapshot

- {profile["user_profile"]["one_line"]}

## Communication Style

{communication}

## Working Style

{working}

## Technical Preferences

{technical}

## Current Focus

{focus}

## Project Runtime Snapshot

{project_rows}

## Brief Excerpt

```md
{brief_block}
```
"""


def render_agents_md(shared_md: str) -> str:
    return f"""# AGENTS.md

이 파일은 전역 메모리 export다. 아래 내용을 사용자 고정 컨텍스트로 취급한다.

{shared_md}
"""


def render_claude_md(shared_md: str) -> str:
    return f"""# CLAUDE.md

Claude Code는 아래 내용을 사용자/프로젝트 공통 메모리로 취급한다.

{shared_md}
"""


def render_gemini_md(shared_md: str) -> str:
    return f"""# GEMINI.md

Gemini CLI 프로젝트 컨텍스트:

{shared_md}
"""


def render_cursor_rule(shared_md: str) -> str:
    return f"""---
description: Global memory for Dowon projects
globs:
alwaysApply: true
---

{shared_md}
"""


def render_windsurf_md(shared_md: str) -> str:
    return f"""# Windsurf Global Memory

Cascade rules seed:

{shared_md}
"""


def main() -> None:
    profile = load_json(PROFILE_PATH)
    projects = load_json(PROJECTS_PATH)
    brief_text = BRIEF_PATH.read_text(encoding="utf-8") if BRIEF_PATH.exists() else "brief not found"
    shared_md = render_shared_markdown(profile, projects, brief_text)

    ADAPTER_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    (EXPORT_DIR / "source_of_truth.md").write_text(shared_md, encoding="utf-8")
    (ADAPTER_DIR / "AGENTS.md").write_text(render_agents_md(shared_md), encoding="utf-8")
    (ADAPTER_DIR / "CLAUDE.md").write_text(render_claude_md(shared_md), encoding="utf-8")
    (ADAPTER_DIR / "GEMINI.md").write_text(render_gemini_md(shared_md), encoding="utf-8")
    (ADAPTER_DIR / "cursor-global-memory.mdc").write_text(render_cursor_rule(shared_md), encoding="utf-8")
    (ADAPTER_DIR / "windsurf-global-memory.md").write_text(render_windsurf_md(shared_md), encoding="utf-8")
    (EXPORT_DIR / "memory_index.json").write_text(
        json.dumps(
            {
                "generated_at": profile["generated_at"],
                "adapters": [adapter["file"] for adapter in profile["adapters"]],
                "projects": [project["id"] for project in projects["projects"]]
            },
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )
    print("synced global memory adapters")


if __name__ == "__main__":
    main()
