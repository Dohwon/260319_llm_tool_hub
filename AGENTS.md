# AGENTS.md - 260319_llm_tool_hub

## 작업 원칙

- 이 프로젝트의 정답 소스는 `data/registry.json`, `data/projects.json`, `global_memory/memory_profile.json`이다.
- 모델/툴 추천을 바꿀 때는 장점/약점/메모리 공유 설계를 함께 수정한다.
- 버전 정보는 추측으로 덮어쓰지 말고 공식 문서 또는 공식 저장소 기준으로 갱신한다.
- 공개용 UI는 정적 HTML/CSS/JS를 우선하고, 외부 의존성은 최소화한다.

## 메모리 원칙

- 전역 메모리는 `global_memory/memory_profile.json`을 정규화 원본으로 유지한다.
- `global_memory/adapters/` 파일은 직접 수기 수정하지 않고 `scripts/sync_global_memory.py`로 재생성한다.
