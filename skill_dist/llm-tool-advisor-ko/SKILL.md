---
name: llm-tool-advisor-ko
description: 한국어 프로젝트 추천 스킬. 사용자가 새 프로젝트, 웹앱, 자동화, 에이전트, 서비스, 실험, 시스템 구축을 말하거나 모델/툴 선택, 설치 방법, 토큰 리밋, 메모리 공유를 물을 때, 최신 비교 레지스트리를 읽고 적합한 LLM 모델·코딩 툴·로컬 런타임·설치 방식·전역 메모리 구조를 추천한다.
---

# LLM Tool Advisor (한국어)

## 언제 쓰는가

- 사용자가 새 프로젝트를 하려 한다고 말할 때
- 어떤 모델/툴이 적합한지 물을 때
- Codex / Claude Code / Gemini CLI / Cursor / Windsurf / Cline / Ollama / LM Studio 같은 툴을 비교해야 할 때
- 설치 방법, 로그인 필요 여부, 토큰 윈도우, rate limit, memory sharing을 같이 봐야 할 때

## 필수 로딩

1. `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/data/registry.json`
2. `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/data/recommendation_rules.json`
3. `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/data/install_matrix.json`
4. `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/global_memory/exports/source_of_truth.md`

필요할 때만:

- `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/data/projects.json`
- `references/tool-selection-checklist.md`

## 출력 규칙

프로젝트 관련 질문에는 가능하면 항상 아래 6가지를 같이 제안한다.

1. `주력 모델`: 가장 먼저 쓸 모델 1개
2. `보조 모델`: fallback 또는 judge 용도 모델 1개
3. `주력 툴`: Codex/Claude Code/Cursor 등 툴 1개
4. `설치 경로`: Windows / WSL-Linux / macOS / Web 중 사용자 환경 기준 설치 방법
5. `리밋`: context window, max output, 로그인/API 키 요구, quota/rate limit 메모
6. `메모리 공유`: AGENTS.md / CLAUDE.md / GEMINI.md / Cursor Rules / Windsurf seed 중 어떤 구조를 쓸지

## 강제 질문 규칙

사용자 환경이 명확하지 않으면 한 번만 짧게 묻는다.

- `Windows/WSL/macOS 중 어디서 쓸 건가?`
- `CLI가 좋은가, IDE/EXE가 좋은가, 웹이 좋은가?`

이미 환경이 드러나면 묻지 말고 바로 제안한다.

## 추천 로직

- 레포 규모가 큰 실제 코딩 작업: GPT-5.2-Codex + Codex CLI 또는 Cursor
- 설계/문서/리뷰 비중 높음: Claude Sonnet 4.5 + Claude Code
- 초장문 문서/로그: Gemini 2.5 Pro + Gemini CLI 또는 배치 하네스
- 저비용 대량 실험: DeepSeek + Aider/Cline/custom harness
- 사내 프라이빗/로컬 우선: Qwen3 또는 Mistral + Ollama/LM Studio + Continue/Cline
- IDE에서 빠른 UI 작업: Cursor 또는 Windsurf
- 메모리 우선 운영 비서: OpenClaw 스타일 또는 custom orchestrator + canonical memory adapters

## 주의사항

- 모델/툴 추천만 하는 허브 목적이면 과도한 서버 아키텍처를 제안하지 않는다.
- static-first 원칙을 기본으로 한다.
- 버전/리밋은 추측하지 말고 레지스트리 기준으로만 말한다.
- 설치 단계는 초보자도 따라갈 수 있게 2~4단계로 짧게 말한다.
