# GEMINI.md

Gemini CLI 프로젝트 컨텍스트:

# Shared Source of Truth

## User Snapshot

- AI 회사에서 LLM/음성(STT) 기반 제품과 데이터 분석, 플랫폼/업무기획을 함께 다루는 실행형 PM

## Communication Style

- 한국어 기본, 필요시 영어 용어 혼합
- 직설적이고 실무형
- 핵심 -> 근거 -> 실행 순서 선호
- 모르면 모른다고 하고 확인 방법을 제시

## Working Style

- 조건 + 관측 + 가설 + 검증 구조 선호
- 명령어와 수치, 재현 가능한 근거 선호
- 실행 가능한 산출물을 선호
- 불필요한 예절보다 정확한 톤 선호

## Technical Preferences

- Windows-first, WSL 적극 사용
- Android/Kotlin 관심
- 무거운 프레임워크보다 현실적인 구성 선호
- 보안/데이터 유출/대화 기록 저장 리스크를 항상 고려

## Current Focus

- Portfolio Homepage 운영 및 확장
- A2A-ready 음성 라우팅 구조 고도화
- Todack 감정 기록/음성 코칭 제품
- 모델/툴/메모리 허브 구축

## Project Runtime Snapshot

- Portfolio Homepage | live | Railway + Node | Railway public deployment / repo: portfolio-homepage
- LLM Tool Hub | live | Railway + Python static | Railway public deployment + local source: /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub
- 260315_MoE_Prompt_Routing | internal | Local Python CLI | /home/dowon/securedir/git/codex/projects/260315_MoE_Prompt_Routing
- 260317_desktop_scheduler | internal | Windows local desktop | Windows desktop shortcut + local SQLite
- Todack | in-progress | Local web + mobile app | /home/dowon/securedir/git/codex/projects/Todack
- gemini_multiturn_tester_v3 | internal | Local CLI batch runner | /home/dowon/securedir/git/codex/projects/gemini_multiturn_tester_v3

## Brief Excerpt

```md
# Dowon — Manager Agent Reference (업무/성향 요약)

> 목적: Codex에서 “관리자(Manager) Agent”가 **도원의 업무 스타일**로 일관되게 판단/지시/리뷰할 수 있도록 하는 참고 문서

## 0) 한 줄 프로필
- AI 회사에서 **LLM/음성(STT) 기반 제품** 쪽을 다루며, **데이터 분석 + 플랫폼/업무기획**을 함께 한다.
- “대충 그럴듯한 말”보다 **재현 가능한 근거(명령어/수치/로그/조건)** 를 선호한다.
- 기본 환경은 **Windows-first**, 필요하면 **WSL(Ubuntu)** 을 적극 사용한다.

---

## 1) 주로 하는 일(업무 스코프)
### 1.1 음성/대화형 제품 운영·개선
- 음성 명령 기반 기능 정의/정리(조건, 제약, 실패 케이스 문구)
- STT 인식률/UX 이슈 원인 분석(거리, 높이, 환경 등 물리 조건 포함)
- “기기 상태(pre-condition) → 실행 가능/불가” 규칙을 제품/데이터 관점에서 구조화

### 1.2 LLM/NLU 데이터 분석 & 인텐트 분류
- 한국어 문장/발화 데이터의 **형태소 기반 정규화**(원형 vs 조합형)
- 인텐트별 문장 묶음 → 핵심 토큰 빈도/피벗 구성 → 유사도(Cosine 등)로 분류
- TF‑IDF 가중치 왜곡 이슈를 인지하고 Count 기반 접근도 병행

### 1.3 온디바이스/엣지 AI 관련 기획·기술 커뮤니케이션
- 온디바이스 vs 온프레미스 vs 클라우드(Azure/AWS) 보안·데이터 흐름 비교
- NPU/GPU/CUDA/ONNX/양자화(quantization) 등 “현장 적용” 중심 이해 확장
- AOSP 기기에서 GMS/CTS/GTS 요구사항 및 대체 전략 관심

### 1.4 실무 잡기술(업무 효율)
```

