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

## Integration (shipped)

| Surface | Path |
| --- | --- |
| OAuth connect | `POST /services/restream/connect` + `verify` |
| Credential platform | `CredentialPlatform` / domain `Platform.RESTREAM` |
| Env | `RESTREAM_CLIENT_ID`, `RESTREAM_CLIENT_SECRET`, `RESTREAM_REDIRECT_URI` |
| Chat ingest API | `POST /bots/:id/livestream-session/restream-chat` |
| Host captions | `POST /bots/:id/livestream-session/transcript` (`source` field) |
| Minute processing | Active livestream sessions sync Restream Chat when `transcriptSource=restream_chat` |
| Workflow node | `restreamChatIngest` + catalog template `restream-chat-context-ingest` |

## How to apply

- Prefer Restream Chat for audience context when the brand multistreams.  
- Never document OBS as the only host-speech path.  
- Keep destination delivery (YouTube/Twitch post) separate from context ingest.  
- Connect Restream OAuth per brand; set bot `restreamCredentialId` or auto-resolve brand RESTREAM credential.
