---
name: thread generation type lock
description: An agent thread is image or video generation, not both
type: feedback
---

# Image and video stay on separate threads

The first `generation_action_card` in a conversation locks that thread to
`image` or `video`. A later request for the other type must not dock the
other card on the same composer.

**Why:** An image thread titled "One Image Simple Red Apple" was docking
**Generate Video** after a follow-up video prompt, with mixed image/video
turns in one transcript. Model prefs are already keyed
`threadId:image|video`; the conversation itself was not.

**How to apply:**

1. `resolveThreadGenerationType` / `resolveLockedGenerationType` read the
   earliest generation card.
2. The docked composer card and `findPendingGenerationAction` ignore the
   other type, including `pendingUiActions` from the live stream.
3. `prepare_generation` returns an error telling the operator to start a
   new chat instead of emitting a mismatched card.
