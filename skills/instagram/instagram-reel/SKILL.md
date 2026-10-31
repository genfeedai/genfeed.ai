---
name: instagram-reel
description: Write an Instagram Reel; the hook, a timed shot-by-shot script with text overlays, the caption, audio direction and handoff to video tools. Use for "Reel script", "Instagram Reel idea", "short video for Instagram". For feed images use instagram-post; for Stories use instagram-story.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# Instagram Reel

Write an Instagram Reel: a short vertical video where the hook and pacing decide everything. Reels are Instagram's main discovery format.

For feed images use [instagram-post](../instagram-post/SKILL.md). For slide posts use [instagram-carousel](../instagram-carousel/SKILL.md). For ephemeral sequences use [instagram-story](../instagram-story/SKILL.md).

## Inputs

- The topic, the one point and any real footage, screenshots or demos available.
- Audience, voice, brand context and on-camera or faceless preference.
- The goal: reach, saves, followers, leads.
- Length target (educational is often 15 to 30 seconds, entertainment 7 to 15; test on the account).

## Workflow

1. **Choose the hook** (first 3 seconds, visual plus spoken plus text).
2. **Write the script** in the template below, scene by scene, with timing.
3. **Plan the visuals:** footage you have, screen recordings, generated B-roll, text cards.
4. **Write the caption** (complementary, not a repeat) and 3 to 5 hashtags.
5. **Pick audio direction.**
6. **Produce or hand off** (see below).
7. **Check** against the list at the end.

## Structure

```
HOOK (0-3s)    stop the scroll: visual + spoken line + text overlay
CONTENT        deliver the value with fast cuts and visual variety
CTA (last 3s)  say what to do next
```

## Hooks

| Type | Script | Text overlay |
|------|--------|--------------|
| Curiosity | "Nobody talks about this..." | "THE SECRET TO [TOPIC]" |
| Challenge | "Try this and watch what happens" | "YOU NEED TO TRY THIS" |
| Result | "This is how I [result]" | "BEFORE → AFTER" |
| Controversy | "Unpopular opinion:" | "HOT TAKE" |
| Tutorial | "Here's how to [do thing] in 30 seconds" | "QUICK TUTORIAL" |
| Story | "The craziest thing just happened" | "STORYTIME" |
| List | "3 things that changed my [result]" | "GAME CHANGERS" |
| POV | "POV: you finally [outcome]" | "POV:" |

Only claim a result if it is real.

## Script template

```
HOOK (0-3s)
  Visual: [what appears]
  Audio:  [spoken line or music cue]
  Text:   [on-screen text]

POINT 1 (3-8s)
  Visual / Audio / Text

POINT 2 (8-15s)
  Visual / Audio / Text

POINT 3 (15-25s)
  Visual / Audio / Text

CTA (last 3s)
  Visual: [face to camera or end card]
  Audio:  "Follow for more [topic]" / "Save this for later"
  Text:   [FOLLOW FOR MORE] or [SAVE THIS]
```

## Optimization

- **Text overlays are essential.** Many people watch without sound; put the point on screen.
- **First frame** must be interesting even as a still thumbnail.
- **Loop potential:** let the last line connect to the first.
- **Pace:** change something on screen every 1 to 3 seconds.
- **Caption:** complement the Reel; do not repeat it.
- **Hashtags:** 3 to 5 relevant tags.
- **Trending audio:** use only if it fits; check licensing for brand and business accounts, since commercial accounts often have a restricted music library (verify in the app).
- Reach and watch-time claims are creator heuristics, not published weights. Compare against the account's own Insights.

## Production handoff

This skill writes the script. To make the video:

- Raw clips from a model: `cinematic-prompting` for the shot prompts, then `media-forge` to run them (needs a provider key; say the cost first).
- A recording or long video cut into a vertical clip: `clip-cutter` when installed; for the 9:16 layout and caption rules see `tiktok-video`, which uses the same format.
- Code-driven motion graphics or an animated explainer: `motion-video` when installed.
- Brand rules for captions, logo and end card: `video-brand-profile`.
- UGC-style ad scripts: `ugc-ad-prompts`.

If nothing is installed to render, deliver the script, shot list and caption, and say the editing is a separate step.

## Output format

```
Hook: [line + text overlay]
Length: [seconds]

SCRIPT
[scene-by-scene per template]

Caption: [complementary caption]
Hashtags: [3-5]
Audio direction: [original audio / style of sound / specific idea; no unverified trending claims]
Shot list: [footage needed, who or what is on screen]
On-screen text list: [every overlay in order]
Cover frame: [what the thumbnail shows]
```

## Genfeed integration

If Genfeed tools are available:

- `generate_content` with `{type: "script", platform: "instagram", topic, brandId}` gives a starting script to edit.
- `generate` makes image or video clips; media generation is asynchronous, so poll `get_job_status`. Check `get_generation_options` for cost first and get the user's agreement.
- `create_post` saves a draft with `platforms: ["instagram"]` and `mediaUrls`. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Hook works in the first 3 seconds with the sound off
- [ ] One point; each scene earns the next
- [ ] Text overlays carry the message
- [ ] First frame works as a thumbnail
- [ ] Caption complements the video
- [ ] Every claim and number is real
- [ ] Music rights confirmed for the account type
- [ ] CTA is one clear ask
