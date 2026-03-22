# Active Tasks

## 2026-03-19

- `in_progress` LLM Tool Hub 정보구조 재설계
  - 목적: HOME / MEMORY 분리 탭, 공급자 로그인/세션 저장, 모델별 sync, bidirectional shared memory 구조로 재구성
  - 현재 상태: Shared Memory Hub를 탭형으로 분리하고 planner-agent-ko / idea-agent-ko 메모리 계약을 handover 구조에 반영 중
- `completed` 전역 스킬 `llm-tool-advisor-ko` 설치 반영
  - 목적: 사용자가 프로젝트를 언급할 때 적합한 모델/툴/메모리 공유 구조를 추천하는 전역 스킬 활성화
- `completed` Railway 배포 및 공개 URL 확보
  - 목적: 외부에서도 허브를 바로 볼 수 있게 Railway에 public URL 배포
  - 상태: `https://celebrated-enjoyment-production.up.railway.app/`
- `deferred` 기존 homepage 원본 직접 연동
  - 목적: 운영 중 홈페이지와 링크 연결
  - 보류 사유: 원본 수정 금지 원칙을 우선 적용
