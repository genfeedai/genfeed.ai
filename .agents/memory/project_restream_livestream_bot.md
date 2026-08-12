---
name: restream_livestream_bot
description: Restream-first livestream bot architecture — chat via Restream WS, host speech via external STT webhook (not OBS)
type: project
last_verified: 2026-08-12
---

# Restream-first livestream bot

## Product context

Hosts use **Restream Studio** (not OBS) to multistream. Genfeed must not assume OBS virtual cables or desktop capture.

## Architecture

```
Restream Studio (encoder + multistream)
        │
        ├─► destinations: YouTube / Twitch / …
        │
        ├─► Restream Chat WebSocket (official)
        │      wss://chat.api.restream.io/ws?accessToken=…
        │      → Genfeed POST …/livestream-session/restream-chat
        │      → rolling context chunks (audience)
        │
        └─► host mic audio
               → external STT/captions (SyncWords, Deepgram, …)
               → Genfeed POST …/livestream-session/transcript
               → same rolling context (host speech)
```

## Transcript sources (`LivestreamTranscriptSource`)

| Source | Signal | Restream fit |
| --- | --- | --- |
| `restream_chat` | Unified audience chat | **Default for Restream** |
| `external_caption_webhook` | Host speech captions | Preferred host path without OBS |
| `audio_url` | STT on a URL | Ad-hoc / recording |
| `manual` | Producer paste | Fallback |

YouTube Live auto-captions are **not** a public real-time consumer API. Do not design around scraping them.

## API

- `POST /bots/:id/livestream-session/restream-chat` — batch Restream WS actions  
- `POST /bots/:id/livestream-session/transcript` — text or `audioUrl` STT  
- Settings: `transcriptSource`, `restreamCredentialId`, `transcriptEnabled`

## Cost

- Restream Chat API: free with OAuth; no YouTube chat quota burn for multi-destination listen  
- Per-destination **replies** may still use YouTube/Twitch APIs (quota)  
- Host STT: provider $/min  

## How to apply

- Prefer Restream Chat for audience context when the brand multistreams.  
- Never document OBS as the only host-speech path.  
- Keep destination delivery (YouTube/Twitch post) separate from context ingest.
