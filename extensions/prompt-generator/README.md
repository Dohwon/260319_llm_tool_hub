# Prompt Generator MVP

Simple Chrome Extension MVP that captures selected page text and turns it into a structured prompt template.

## What it does

- Saves the latest highlighted text from the current page
- Builds a prompt from goal, tone, audience, and output format
- Stores recent prompt drafts in `chrome.storage.local`

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

## Limits

This MVP is local-only. It does not call an LLM API yet.
