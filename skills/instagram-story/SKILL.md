---
name: instagram-story
description: Write an Instagram Story sequence; a 5-7 frame arc with on-frame text, stickers (poll, question, quiz, slider, countdown, link, add yours), a CTA and a weekly theme calendar. Use for "Instagram Stories", "story sequence", "plan my stories". For feed posts use instagram-post; for Reels use instagram-reel.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# Instagram Story

Write an Instagram Story sequence. Stories are for connection, not perfection: casual, ephemeral and interactive. They mostly reach existing followers, so use them to deepen relationships and drive action (replies, DMs, link taps), not to find new audiences.

For feed posts use [instagram-post](../instagram-post/SKILL.md). For discovery video use [instagram-reel](../instagram-reel/SKILL.md).

## Inputs

- The point of the sequence: teach, tell, sell, poll, announce, preview.
- Real material: photos, clips, screenshots, numbers. Do not invent testimonials or results.
- Audience, voice and brand context.
- The action wanted: reply, vote, DM a keyword, tap a link.

## Workflow

1. **Choose the arc** (5 to 7 frames; shorter is fine).
2. **Write each frame:** format, on-frame text, sticker.
3. **Put the interactive frame** in the middle, not at the end.
4. **Write the CTA frame.**
5. **Check** against the list below.

## 5-7 frame arc

| # | Purpose | Format |
|---|---------|--------|
| 1 | Hook | Bold text or face to camera: "I need to tell you something" |
| 2 | Context | Photo or video with text setting the scene |
| 3 | Value | The core insight, tip or story beat |
| 4 | Interactive | Poll, question box, quiz or slider |
| 5 | Deeper dive | Extra context, behind the scenes or proof |
| 6 | Summary | The takeaway in text |
| 7 | CTA | "DM me", "Tap the link", "Vote above", "Share this" |

## Stickers

| Sticker | Best use | Example |
|---------|----------|---------|
| Poll | Binary choice, opinion | "Do you track your content metrics? Yes / No" |
| Question box | Open Q&A | "What's your biggest struggle with [topic]?" |
| Quiz | Education | "How many hashtags should you use? A) 5 B) 15 C) 25 D) 30" |
| Slider | Sentiment | "How confident are you in your content strategy?" |
| Countdown | Launch, event, deadline | "New course drops in..." |
| Link | Drive traffic | "Full guide here" |
| Add Yours | Community, trends | "Add your workspace setup" |

Sticker availability changes by account and region; confirm in the app. Use one interactive sticker per frame and reply to responses; replies are the point.

## Weekly theme calendar

| Day | Theme | Example |
|-----|-------|---------|
| Monday | Week opener | "This week's goal: [goal]" |
| Tuesday | Tutorial or tip | Quick how-to in 3 to 5 frames |
| Wednesday | Behind the scenes | Process, workspace or routine |
| Thursday | Engagement | Poll or Q&A |
| Friday | Wins and wrap-up | "This week I [accomplished X]" |
| Saturday | Personal | The human behind the brand |
| Sunday | Preview | "Next week I'm working on..." |

Cadence is a preference, not a rule. A common range is a few frames on most days; Stories expire after 24 hours unless saved as Highlights.

## Design notes

- Vertical 9:16 full-bleed; keep text inside the safe area so the UI overlays do not cover it.
- Large text, high contrast, one idea per frame.
- Same fonts and colors as the feed.
- Put hashtags and mentions in stickers or small text, sparingly.
- For branded text frames or covers, `carousel-renderer` (when installed) can render PNGs locally; for generated imagery use `image-prompt-engineer`.

## Output format

```
Goal: [reply / vote / DM / link tap]
Frames: [N]

Story 1: [Format] | [On-frame text] | [Sticker: none / poll / question / quiz / slider / countdown / link / add yours]
Story 2: ...
...
Story N: [Format] | [CTA] | [Sticker / link]

Highlight: [save to a Highlight? name]
Follow-up: [how to answer replies and DMs]
```

## Genfeed integration

If Genfeed tools are available, `generate_content` can draft the on-frame copy and `upload_media` can store frames. Whether a Story can be drafted or scheduled through Genfeed depends on the account and channel; check `check_channel` with `{action: "capabilities", input: {platform: "instagram"}}` and say so if Stories are not supported. Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Hook frame is clear without audio
- [ ] One idea per frame; short text
- [ ] Interactive frame in the middle
- [ ] One clear CTA at the end
- [ ] Text inside the safe area
- [ ] Facts and numbers are real
- [ ] Plan to answer replies and DMs
