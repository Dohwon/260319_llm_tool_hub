# Strategy Roadmap

## 장기 방향

- 모델/툴 비교를 수기 문서가 아니라 갱신 가능한 레지스트리 자산으로 유지
- 프로젝트 추천 단계에서 설치 경로, access requirement, cost/rate limit까지 자동으로 묶어 제안
- 전역 메모리를 `canonical JSON -> per-tool adapter` 구조로 고정
- 홈페이지, 내부 프로젝트, 향후 운영 에이전트를 하나의 런타임 보드로 연결
- static-first 아키텍처를 유지하되 필요할 때만 얇은 API를 추가
- 메모리 허브에서 long/mid/short term, personalization, project state, issue log가 모두 handover 가능하도록 유지
- 모델 내부 메모리와 전역 shared memory, 사람 협업용 collaboration packet을 분리해 관리
