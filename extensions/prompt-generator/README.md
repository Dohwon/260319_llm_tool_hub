# Prompt Generator

Chrome Extension for structured prompt generation with free trial + Pro gating.

## What it does

- Developer mode에서는 자동으로 로컬 테스트 서버(`http://127.0.0.1:4299`)를 사용
- Web Store/배포본은 Railway 라이브 서버를 사용
- 무료 3회, 월 300회, 1회 2000자 제한
- 최근 프롬프트를 `chrome.storage.local`에 저장

## Local install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `extensions/prompt-generator`

## ZIP for Chrome Web Store

Zip the contents of this folder, not the parent folder.

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/extensions/prompt-generator
zip -r ../prompt-generator.zip .
```

## Developer Mode Test

전체 순서는 [docs/extension-dev-test.md](/home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/docs/extension-dev-test.md)를 보면 된다.
