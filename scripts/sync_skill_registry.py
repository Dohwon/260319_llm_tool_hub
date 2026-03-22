#!/usr/bin/env python3
import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "data" / "skill_registry.json"
GLOBAL_SKILLS_DIR = Path("/home/dowon/.codex/skills")
STAGED_SKILLS_DIR = ROOT / "skill_dist"

ROLE_MAP = {
    "multi-agent-manager-ko": ("manager", "global-management"),
    "llm-tool-advisor-ko": ("advisor", "tool-recommendation"),
    "planner-agent-ko": ("specialist", "planning"),
    "architect-agent-ko": ("specialist", "architecture"),
    "implementer-agent-ko": ("specialist", "implementation"),
    "qa-agent-ko": ("specialist", "qa"),
    "idea-agent-ko": ("specialist", "idea"),
    "design-trend-agent-ko": ("specialist", "design"),
    "startup-business-strategist-ko": ("specialist", "business"),
    "sql-data-insight-ko": ("specialist", "data"),
    "prompt-personalization-ko": ("specialist", "prompt"),
    "entp-clone-ko": ("specialist", "persona"),
    "mortality-resident-ko": ("specialist", "wellbeing"),
    "personal-essay-writer-ko": ("specialist", "writing"),
    "portfolio-blog-writer-ko": ("specialist", "content"),
    "openai-docs": ("system", "docs"),
    "skill-creator": ("system", "authoring"),
    "skill-installer": ("system", "installation")
}


def parse_frontmatter(skill_md: Path) -> dict:
    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {"name": skill_md.parent.name, "description": ""}
    _, frontmatter, _ = text.split("---", 2)
    data = {}
    for line in frontmatter.splitlines():
      if ":" not in line:
        continue
      key, value = line.split(":", 1)
      data[key.strip()] = value.strip()
    return {"name": data.get("name", skill_md.parent.name), "description": data.get("description", "")}


def collect_skills(base_dir: Path, status: str) -> list[dict]:
    skills = []
    if not base_dir.exists():
        return skills
    for skill_md in sorted(base_dir.rglob("SKILL.md")):
        skill_dir = skill_md.parent
        meta = parse_frontmatter(skill_md)
        role, scope = ROLE_MAP.get(meta["name"], ("specialist", "misc"))
        skills.append(
            {
                "name": meta["name"],
                "description": meta["description"],
                "role": role,
                "scope": scope,
                "status": status,
                "model_target": "codex",
                "trigger": "metadata 기반 자동 트리거 또는 명시적 skill mention",
                "memory_pattern": "AGENTS.md / manager_memory / project references",
                "path": str(skill_dir)
            }
        )
    return skills


def build_hierarchy(skills: list[dict]) -> list[dict]:
    by_role = {}
    for skill in skills:
        by_role.setdefault(skill["role"], []).append(skill)

    def members(role: str) -> list[dict]:
        return [{"name": skill["name"], "summary": skill["scope"]} for skill in by_role.get(role, [])]

    return [
        {"role": "사장", "label": "Dowon", "members": [{"name": "사용자", "summary": "최종 의사결정"}]},
        {"role": "부장", "label": "Codex Root", "members": [{"name": "Codex", "summary": "메인 실행 에이전트"}]},
        {"role": "차장", "label": "Manager / Advisor", "members": members("manager") + members("advisor")},
        {"role": "과장", "label": "Specialists", "members": members("specialist")},
        {"role": "대리·알바", "label": "System Utilities", "members": members("system")}
    ]


def merge_skills(installed: list[dict], staged: list[dict]) -> list[dict]:
    merged = {skill["name"]: skill for skill in installed}
    for skill in staged:
        merged.setdefault(skill["name"], skill)
    return sorted(merged.values(), key=lambda skill: skill["name"])


def main() -> None:
    installed = collect_skills(GLOBAL_SKILLS_DIR, "installed")
    staged = collect_skills(STAGED_SKILLS_DIR, "staged")
    skills = merge_skills(installed, staged)
    payload = {
        "generated_at": str(date.today()),
        "models": [
            {
                "id": "codex",
                "label": "Codex",
                "status": "active",
                "runtime": "~/.codex/skills + AGENTS.md",
                "memory_mode": "global adapters",
                "skill_count": len(skills),
                "summary": "현재 실제 스킬 시스템이 동작하는 주 런타임. 코덱스부터 기록."
            },
            {
                "id": "claude-code",
                "label": "Claude Code",
                "status": "planned",
                "runtime": "CLAUDE.md",
                "memory_mode": "file memory",
                "skill_count": 0,
                "summary": "전용 skill runtime보다는 CLAUDE.md 중심 메모리로 연결할 계획."
            },
            {
                "id": "gemini-cli",
                "label": "Gemini CLI",
                "status": "planned",
                "runtime": "GEMINI.md",
                "memory_mode": "file memory",
                "skill_count": 0,
                "summary": "전용 skill runtime보다는 GEMINI.md 중심 컨텍스트로 연결할 계획."
            }
        ],
        "skills": skills,
        "hierarchy": build_hierarchy(skills)
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("skill registry synced")


if __name__ == "__main__":
    main()
