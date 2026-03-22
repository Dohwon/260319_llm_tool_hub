# Global Memory Bridge

## 목적

- 특정 벤더의 메모리 기능에 종속되지 않는 전역 메모리 구조를 만든다.
- 사용자 정보, 업무 스타일, 프로젝트 상태, 의사결정 히스토리를 한 번 정규화하고 여러 툴로 파생한다.

## 원칙

1. 정답 소스는 하나만 둔다.
2. 툴별 파일명과 포맷 차이는 어댑터 레이어에서 해결한다.
3. 공유 메모리는 프로젝트 설명보다 행동 규칙, 선호도, 현재 집중 과제 위주로 유지한다.
4. 자동 갱신 스크립트가 생성한 파일을 각 툴의 요구 파일명으로 복사/심볼릭링크한다.

## 권장 구조

1. `global_memory/memory_profile.json`
2. `global_memory/exports/source_of_truth.md`
3. `global_memory/adapters/AGENTS.md`
4. `global_memory/adapters/CLAUDE.md`
5. `global_memory/adapters/GEMINI.md`
6. `global_memory/adapters/cursor-global-memory.mdc`
7. `global_memory/adapters/windsurf-global-memory.md`

## 연결 방식

- Codex/Cursor 계열: `AGENTS.md` 또는 `.cursor/rules/*.mdc`
- Claude Code: `CLAUDE.md`
- Gemini CLI: `GEMINI.md`
- Windsurf: Rules + Memories
- 범용 툴: `source_of_truth.md` 직접 주입

## 메모리 내용 예시

- 사용자 톤: 직설적, 근거 중심, 실행 가능한 답 선호
- 업무 스타일: 조건-관측-가설-검증
- 환경 선호: Windows-first, WSL 적극 사용
- 주력 영역: 음성/STT, LLM Agent, 데이터 분석, PM
- 현재 프로젝트: 홈페이지, 라우팅 구조, 툴 허브
