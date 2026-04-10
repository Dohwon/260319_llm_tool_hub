#!/usr/bin/env python3
import json
from pathlib import Path

from sync_skill_registry import GLOBAL_SKILLS_DIR, DEPARTMENT_ORDER, collect_skills


ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "data" / "skill_registry.json"


def load_registry_names() -> list[str]:
    if not REGISTRY_PATH.exists():
        return []
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return sorted(skill["name"] for skill in data.get("skills", []))


def build_department_map(skills: list[dict]) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = {}
    for skill in skills:
        buckets.setdefault(skill["department"], []).append(skill)
    for department in buckets:
        buckets[department].sort(key=lambda skill: skill["name"])
    return buckets


def print_section(title: str) -> None:
    print(f"\n[{title}]")


def print_ascii_tree(skills: list[dict]) -> None:
    departments = build_department_map(skills)
    print("CODEX COMPANY")
    print("├── Owner: User")
    print("├── Root Operator: Codex")
    print("└── Departments")
    ordered_departments = DEPARTMENT_ORDER + sorted(set(departments) - set(DEPARTMENT_ORDER))
    active_departments = [department for department in ordered_departments if department in departments]
    for dept_index, department in enumerate(active_departments):
        is_last_department = dept_index == len(active_departments) - 1
        dept_branch = "└──" if is_last_department else "├──"
        child_indent = "        " if is_last_department else "    │   "
        print(f"    {dept_branch} {department}")
        members = departments[department]
        for skill_index, skill in enumerate(members):
            skill_branch = "└──" if skill_index == len(members) - 1 else "├──"
            print(f"{child_indent}{skill_branch} {skill['name']} [{skill['team']}]")


def build_mermaid(skills: list[dict]) -> str:
    departments = build_department_map(skills)
    lines = [
        "graph TD",
        '    USER["Owner: User"] --> CODEX["Root Operator: Codex"]',
        '    CODEX --> DEPTS["CODEX COMPANY Departments"]'
    ]
    ordered_departments = DEPARTMENT_ORDER + sorted(set(departments) - set(DEPARTMENT_ORDER))
    for index, department in enumerate(ordered_departments, start=1):
        members = departments.get(department, [])
        if not members:
            continue
        dept_id = f"D{index}"
        lines.append(f'    DEPTS --> {dept_id}["{department}"]')
        for skill_index, skill in enumerate(members, start=1):
            skill_id = f"{dept_id}S{skill_index}"
            lines.append(f'    {dept_id} --> {skill_id}["{skill["name"]}<br/>{skill["team"]}"]')
    return "\n".join(lines)


def main() -> None:
    installed_skills = sorted(collect_skills(GLOBAL_SKILLS_DIR, "installed"), key=lambda skill: skill["name"])
    installed_names = [skill["name"] for skill in installed_skills]
    registry_names = load_registry_names()

    missing_in_registry = sorted(set(installed_names) - set(registry_names))
    registry_only = sorted(set(registry_names) - set(installed_names))

    print_section("Installed Skills")
    print(f"count={len(installed_names)}")
    for skill in installed_skills:
        print(f"- {skill['name']} | {skill['department']} | {skill['team']} | {skill['path']}")

    print_section("Registry Snapshot")
    print(f"count={len(registry_names)}")
    for name in registry_names:
        print(f"- {name}")

    print_section("Diff")
    print(f"- missing_in_registry={missing_in_registry or '[]'}")
    print(f"- registry_only={registry_only or '[]'}")

    print_section("CODEX COMPANY Departments")
    departments = build_department_map(installed_skills)
    ordered_departments = DEPARTMENT_ORDER + sorted(set(departments) - set(DEPARTMENT_ORDER))
    for department in ordered_departments:
        members = departments.get(department, [])
        if not members:
            continue
        names = ", ".join(skill["name"] for skill in members)
        print(f"- {department} ({len(members)}): {names}")

    print_section("ASCII Tree")
    print_ascii_tree(installed_skills)

    print_section("Mermaid")
    print(build_mermaid(installed_skills))


if __name__ == "__main__":
    main()
