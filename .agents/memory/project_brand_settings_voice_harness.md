---
name: brand-settings-voice-harness
description: Brand voice vs speech voice vs brand harness IA
type: project
---

# Brand settings: three “voice” concepts

**Why:** The word “voice” meant writing tone, TTS, and harness delivery knobs.
Users land on `/settings/voice` expecting speech/video audio.

## Canonical surfaces

| Surface | Route | Owns |
|---|---|---|
| **Brand voice** | `/settings/voice` | Agent **writing** tone/style/audience/pillars (`agentConfig.voice`) |
| **Brand harness** | `/settings/harness` | Brand-scoped **runtime** profile (structure, delivery knobs, examples). `brandId` + default `scope: brand` |
| **Speaking voice** | Agent Defaults identity + Library Voices | TTS/speech `defaultVoiceId` / `defaultVoiceRef` |

## Rules

- Nav label is **Brand voice**, not bare “Voice”.
- Harness **is** the brand’s harness (loaded via `findForBrand`, default scope `brand`). Copy must say so.
- Harness “Voice” section is labeled **Delivery style** so it does not collide with Brand voice.
- Agent Defaults does **not** re-embed the full Brand voice form — link to Brand voice instead.
- Social = OAuth accounts; Links = external URLs (separate routes).

## How to apply

When editing brand settings IA or agent context assembly, keep writing voice,
harness structure, and speech assets on these three surfaces — do not merge
them under one “Voice” page without clear section titles.

## Following collector (related)

- X timeline order: brand OAuth user token → app bearer → Apify.
- Sync status: `success` | `empty` | `failed` with `lastSyncError` always shown in Manage sources.
- Brand settings harness scope is locked to `brand` on the settings page.
