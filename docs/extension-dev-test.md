# Extension Developer Mode Test

`prompt-generator`와 `prompt-translator`를 Chrome 개발자 모드에서 동시에 검증하는 가장 쉬운 순서다.

## 1. 로컬 테스트 서버 실행

아래 명령을 실행한다.

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub
bash scripts/start_extension_dev_server.sh
```

이 서버는 아래 조건으로 뜬다.

- 주소: `http://127.0.0.1:4299`
- `PROMPT_DEV_MOCK=1`
- OpenAI 키 없이도 mock 생성/번역 응답 반환
- 무료 3회, 월 300회, 1회 2000자 제한 포함

## 2. Chrome에서 unpacked extension 2개 로드

1. `chrome://extensions` 열기
2. 우측 상단 `개발자 모드` 켜기
3. `압축해제된 확장 프로그램을 로드합니다` 클릭
4. 아래 두 폴더를 각각 추가

- `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/extensions/prompt-generator`
- `/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/extensions/prompt-translator`

중요:
- unpacked 상태에서는 두 익스텐션이 자동으로 `http://127.0.0.1:4299`를 보게 되어 있다.
- 웹스토어 배포본은 자동으로 라이브 서버를 본다.

## 3. generation 테스트

1. `Prompt Generator` 팝업 열기
2. `Goal`, `What should the AI do?`, `What result do you want?` 입력
3. `Generate with AI` 클릭
4. mock 응답이 결과 칸에 들어오는지 확인
5. 상태 문구가 무료 사용량에 맞게 줄어드는지 확인

확인 포인트:
- 무료 3회 차감
- 2000자 초과 시 차단
- Recent 히스토리 저장
- Copy 동작

## 4. translation 테스트

1. `Prompt Translator` 팝업 열기
2. 원문 프롬프트 붙여넣기
3. `From`, `To` 선택
4. `Translate with AI` 클릭
5. mock 번역 결과가 나오는지 확인

확인 포인트:
- 무료 3회 차감
- 2000자 초과 시 차단
- Recent 히스토리 저장
- Copy 동작

## 5. 동시에 테스트할 때 주의

- 두 익스텐션은 `clientId`가 따로라서 사용량도 각각 따로 집계된다.
- generation과 translation을 같은 브라우저에서 같이 띄워도 충돌하지 않는다.
- 둘 다 같은 로컬 서버를 써도 된다.

## 6. 실제 OpenAI 호출로 바꿀 때

mock 대신 실제 호출을 보려면 로컬 서버 실행 전에 아래 환경변수를 넣으면 된다.

```bash
PROMPT_TAILOR_PROVIDER=openai
PROMPT_TAILOR_MODEL=gpt-5-mini
PROMPT_TAILOR_API_KEY=...
PROMPT_TRANSLATE_PROVIDER=openai
PROMPT_TRANSLATE_MODEL=gpt-5-mini
PROMPT_TRANSLATE_API_KEY=...
```

그다음 `scripts/start_extension_dev_server.sh` 대신 직접 실행한다.

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub
HOST=127.0.0.1 PORT=4299 \
PROMPT_CHECKOUT_URL="http://127.0.0.1:4299/#prompt-tailor" \
PROMPT_TAILOR_PROVIDER=openai \
PROMPT_TAILOR_MODEL=gpt-5-mini \
PROMPT_TAILOR_API_KEY=... \
PROMPT_TRANSLATE_PROVIDER=openai \
PROMPT_TRANSLATE_MODEL=gpt-5-mini \
PROMPT_TRANSLATE_API_KEY=... \
python3 server.py
```
