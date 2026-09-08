# Preserve onboarding chat when conversation work cannot be decoded

- Match the work-objects API response in the shared Playwright fallback so onboarding reload and brand-voice approval exercise the real client contract.
- Reject malformed work collections before they reach the UI or review gate; retain the existing retry error state instead of crashing the conversation or allowing generation.
- Cover both read and action responses, including missing arrays and generic JSON:API envelopes.
