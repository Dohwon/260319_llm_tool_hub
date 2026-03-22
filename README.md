# 260319-llm-tool-hub

LLM 모델, 코딩 에이전트 툴, 프로젝트 런타임, 전역 메모리 어댑터를 한 화면에서 관리하는 경량 허브다.

Public URL: `https://celebrated-enjoyment-production.up.railway.app/`

## 목표

- 주요 LLM 모델과 툴의 최신 버전/강점/약점/추천 상황을 한 곳에 정리
- 프로젝트별로 어떤 모델/툴 조합이 맞는지 빠르게 추천
- Codex/Claude Code/Gemini CLI/Cursor/Windsurf 등으로 공유 가능한 전역 메모리 파일 생성
- 현재 작업 중인 프로젝트가 어디에서 돌고 있는지 상태 보드로 가시화
- 포트폴리오 홈페이지와 연결 가능한 공개용 링크/과정 기록 제공

## 실행

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub
node server.js
```

기본 주소는 `http://127.0.0.1:4219`다.

Python 표준 서버로도 확인할 수 있다.

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub
python3 server.py
```

Prompt Studio 로그인/쿼터/서비스 관리형 호출은 `server.py` 기준으로 동작한다.

## Prompt Studio 과금형 운영

무료 3회 후 Pro 전환 구조는 `server.py`와 `data/prompt_access_state.json`으로 관리한다.

필수 환경변수:

```bash
PROMPT_TAILOR_PROVIDER=openai
PROMPT_TAILOR_MODEL=gpt-5-mini
PROMPT_TAILOR_API_KEY=...
```

선택 환경변수:

```bash
PROMPT_FREE_LIMIT=3
PROMPT_CHECKOUT_URL=https://your-checkout-page
PROMPT_TRANSLATE_PROVIDER=openai
PROMPT_TRANSLATE_MODEL=gpt-5-mini
PROMPT_TRANSLATE_API_KEY=...
```

- `PROMPT_TAILOR_*`: 서비스 내부 Prompt Tailor 생성 호출용
- `PROMPT_TRANSLATE_*`: 추후 크롬 익스텐션/웹 번역 호출용
- `PROMPT_CHECKOUT_URL`: Pro 결제 버튼이 열 외부 링크

개발자 세션으로 Pro 코드를 발급할 수 있다.

```bash
curl -sS -b cookie.txt \
  -H 'Content-Type: application/json' \
  -d '{"note":"first customer"}' \
  http://127.0.0.1:4219/api/prompt-access/admin/create-code
```

사용자는 로그인 후 아래 엔드포인트로 코드를 등록한다.

```bash
curl -sS -b cookie.txt \
  -H 'Content-Type: application/json' \
  -d '{"code":"PRO-XXXX"}' \
  http://127.0.0.1:4219/api/prompt-access/redeem
```

## 버전 갱신

```bash
python3 scripts/update_registry.py --registry data/registry.json
```

- 네트워크가 가능한 환경에서 공식 문서/공식 저장소를 다시 확인해 버전 필드를 갱신한다.
- 실패한 소스는 `status: needs_manual_review`로 남긴다.

## 전역 메모리 동기화

```bash
python3 scripts/sync_global_memory.py
```

- `/home/dowon/securedir/git/codex/dowon_manager_agent_brief.md`를 읽어 Canonical Memory를 보강한다.
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor/Windsurf 어댑터 파일을 재생성한다.

## 핵심 파일

- `data/registry.json`: 모델/툴 비교 레지스트리
- `data/projects.json`: 프로젝트별 실행 위치/링크/상태
- `data/recommendation_rules.json`: 상황별 추천 조합
- `global_memory/memory_profile.json`: 전역 메모리 정규화 원본
- `global_memory/adapters/`: 각 툴에 주입할 메모리 파일
- `scripts/update_registry.py`: 버전 갱신 스크립트
- `scripts/sync_global_memory.py`: 메모리 어댑터 생성 스크립트
- `scripts/sync_skill_registry.py`: 모델별 스킬/계층도 데이터 재생성
- `skill_dist/llm-tool-advisor-ko/`: 전역 설치용 추천 스킬 패키지

## Last Updated
- 2026-03-23
