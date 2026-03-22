#!/usr/bin/env python3
import argparse
import json
import re
import urllib.request
from datetime import date
from pathlib import Path


USER_AGENT = "llm-tool-hub-updater/1.0"

TOOL_RULES = [
    {
        "id": "codex-cli",
        "kind": "github_release",
        "url": "https://api.github.com/repos/openai/codex/releases/latest"
    },
    {
        "id": "gemini-cli",
        "kind": "github_release",
        "url": "https://api.github.com/repos/google-gemini/gemini-cli/releases/latest"
    },
    {
        "id": "cline",
        "kind": "github_release",
        "url": "https://api.github.com/repos/cline/cline/releases/latest"
    },
    {
        "id": "aider",
        "kind": "pypi_json",
        "url": "https://pypi.org/pypi/aider-chat/json"
    }
]

MODEL_RULES = [
    {
        "id": "openai-gpt52-family",
        "kind": "html_regex",
        "url": "https://platform.openai.com/docs/models",
        "pattern": r"GPT-5\\.2"
    },
    {
        "id": "anthropic-claude-family",
        "kind": "html_regex",
        "url": "https://www.anthropic.com/system-cards/",
        "pattern": r"Claude Opus 4\\.6"
    },
    {
        "id": "google-gemini-family",
        "kind": "html_regex",
        "url": "https://ai.google.dev/gemini-api/docs/models/gemini",
        "pattern": r"Gemini 2\\.5 Pro"
    },
    {
        "id": "deepseek-v32-family",
        "kind": "html_regex",
        "url": "https://api-docs.deepseek.com/quick_start/pricing",
        "pattern": r"DeepSeek-V3\\.2"
    }
]


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def update_tool(tool: dict, rule: dict) -> None:
    text = fetch_text(rule["url"])
    tool["last_checked_at"] = str(date.today())
    if rule["kind"] == "github_release":
        payload = json.loads(text)
        tag = payload.get("tag_name") or payload.get("name") or "unknown"
        tool["version_label"] = str(tag)
        tool["update_status"] = "ok"
        return
    if rule["kind"] == "pypi_json":
        payload = json.loads(text)
        version = payload.get("info", {}).get("version", "unknown")
        tool["version_label"] = str(version)
        tool["update_status"] = "ok"
        return
    tool["update_status"] = "unsupported"


def update_model(model: dict, rule: dict) -> None:
    text = fetch_text(rule["url"])
    model["last_checked_at"] = str(date.today())
    model["update_status"] = "ok" if re.search(rule["pattern"], text) else "needs_manual_review"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", required=True, help="Path to registry.json")
    args = parser.parse_args()

    registry_path = Path(args.registry).resolve()
    registry = json.loads(registry_path.read_text(encoding="utf-8"))

    tools_by_id = {tool["id"]: tool for tool in registry.get("tools", [])}
    models_by_id = {model["id"]: model for model in registry.get("models", [])}

    failures = []

    for rule in TOOL_RULES:
        tool = tools_by_id.get(rule["id"])
        if not tool:
          continue
        try:
            update_tool(tool, rule)
        except Exception as exc:
            tool["update_status"] = "needs_manual_review"
            tool["update_error"] = str(exc)
            failures.append(rule["id"])

    for rule in MODEL_RULES:
        model = models_by_id.get(rule["id"])
        if not model:
          continue
        try:
            update_model(model, rule)
        except Exception as exc:
            model["update_status"] = "needs_manual_review"
            model["update_error"] = str(exc)
            failures.append(rule["id"])

    registry["generated_at"] = str(date.today())
    registry["update_note"] = "update_registry.py executed"
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")

    if failures:
        print("updated with manual review required:", ", ".join(failures))
    else:
        print("registry updated")


if __name__ == "__main__":
    main()
