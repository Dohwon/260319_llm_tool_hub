# Prompt Translator MVP

Simple Chrome Extension MVP for translating or porting prompt structure between Korean and English.

## What it does

- Pulls highlighted page text into the popup
- Preserves common prompt section headers
- Produces a translated draft that can be copied and refined

## Local install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `extensions/prompt-translator`

## ZIP for Chrome Web Store

Zip the contents of this folder, not the parent folder.

```bash
cd /home/dowon/securedir/git/codex/projects/260319_llm_tool_hub/extensions/prompt-translator
zip -r ../prompt-translator.zip .
```

## Limits

This MVP does not call a translation API. It preserves structure and common section labels for a first shipping prototype.
