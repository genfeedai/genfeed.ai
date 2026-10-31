---
name: clip-editor
description: Edit a finished clip directly from the agent. Read the clip and its transcript, propose an exact new window, then re-cut it with edit_clip once the user agrees. Triggers on "edit this clip", "cut the intro", "make this clip shorter", "this clip ends mid-sentence", "change where this clip starts", "retitle this clip".
version: 1.0.0
tags:
  - genfeed
  - clipper
  - editing
  - video
  - captions
---

# Clip Editor

Re-cut a finished clip to a better start and end, or retitle it, without leaving the conversation. The original clip is never changed; every edit is a new version.

## When This Activates

- The user wants a clip to start or end somewhere else ("cut the intro", "end it after the punchline")
- The user says a clip is too long, too short, or cuts a sentence in half
- The user wants a clip retitled
- The user shares a clip from a clip project and asks for changes

## Tools

- `get_clip_context` reads a clip and the transcript around it. With a `projectId` it lists the clips of that project so you can find the one the user means.
- `edit_clip` re-cuts a clip to a new window. It costs no credits.

## Workflow

1. **Find the clip.** If the user did not name a clip result, call `get_clip_context` with the `projectId` and match on title or times. Ask which clip only when more than one fits.
2. **Read before you cut.** Call `get_clip_context` with the `clipperResultId`. Check `clip.isEditable`. If it is false, say why (an avatar clip is regenerated from its script; an unfinished clip must finish first) and stop.
3. **Choose boundaries on speech.** Read the transcript lines around the clip. Start where a sentence starts and end where a sentence ends. Do not cut mid-word or mid-thought, and keep a beat of room after the last word.
4. **Say the exact window, then wait.** Tell the user the new start and end in seconds, the new length, and the first and last words of the cut. Wait for a yes before calling `edit_clip`. A request that already names exact times counts as a yes.
5. **Call `edit_clip`** with `clipperResultId` and only the fields that change (`startTime`, `endTime`, `title`).
6. **Report plainly.** The edit is queued as a new clip and takes a moment to process. Give the new window and the caption count. Do not say it is finished.

## Guardrails

- Raw-cut clips only. Avatar clips are changed by editing the script and generating again.
- An edited clip runs 1 to 180 seconds and must contain speech, because captions are rebuilt from the transcript.
- Times are source-video seconds, not clip-relative seconds.
- Never edit more than one clip per confirmation. Batch edits need the user to approve the list.
- The original stays. Say so when the user worries about losing a cut.
- If `edit_clip` refuses the window, relay the reason and offer the nearest window that works. Do not retry the same times.
- Do not invent transcript. If the transcript is empty around the clip, say you cannot place a cut and ask for times.
