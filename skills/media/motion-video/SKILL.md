---
name: motion-video
description: Write a Remotion composition with your own Claude or Codex subscription, render it to MP4 or PNG locally, check the frames yourself and package it as Genfeed Motion-style output. No model API, no credits. Triggers on "make a motion video", "motion graphic", "animate this", "remotion video", "kinetic typography", "animated explainer", "code-driven video".
license: MIT
metadata:
  author: genfeedai
  version: 1.2.0
  short-description: "Author a Remotion composition with your own Claude or Codex sub, render it locally and package it as Genfeed Motion-style output, no model API"
  tags: motion, remotion, video, local, worker, genfeed
  outputs: files, json
  triggers: "make a motion video; motion graphic; animate this; remotion video; kinetic typography; animated explainer; code-driven video"
---

# Motion Video

You make short motion videos by writing code. You author a Remotion composition, render it on this machine, look at the frames, fix what is wrong and hand over an MP4 that meets the same limits as Genfeed Motion. The model that writes the code is the one already running this session, so there is no extra generation cost.

Genfeed Cloud's Studio → Motion does the same job with a hosted sandbox and a metered model call. This skill is the local path for people who want the output without that bill.

---

## Run It

```bash
# once per project: copy the starter (with script.json) and install pinned Remotion 4.0.530
bun run scripts/motion.ts init ./my-motion

# check the script, then record the owner's sign-off (only after they accept it)
bun run scripts/motion.ts validate ./my-motion
bun run scripts/motion.ts approve ./my-motion --by "Owner name"

# render a composition to MP4 and check it against the limits
bun run scripts/motion.ts render ./my-motion --id Main --out ./my-motion/out

# override the starter props without editing code
bun run scripts/motion.ts render ./my-motion --props '{"title":"Ship it","subtitle":"Friday deploy"}'

# one still frame as PNG
bun run scripts/motion.ts render ./my-motion --still 45

# review render before approval: writes Main-draft.mp4 and skips the script gate
bun run scripts/motion.ts render ./my-motion --draft

# re-check any file
bun run scripts/motion.ts check ./my-motion/out/Main.mp4

# frame QA: blank frames, text cut by an edge, content inside the safe margins
bun run scripts/motion.ts inspect ./my-motion/out/Main.mp4

# pull evenly spaced frames to look at
bun run scripts/motion.ts frames ./my-motion/out/Main.mp4 --count 6
```

Requires [Bun](https://bun.sh) 1.1+, `ffmpeg` and `ffprobe` on PATH. Remotion fetches its own headless Chrome on first render. To use a browser you already have, pass `--browser /path/to/chrome-headless-shell` or set `REMOTION_BROWSER`.

`render` refuses to run until `script.json` validates and is approved, and exits non-zero when the result breaks a limit. It then runs `inspect` on the result and exits non-zero when two or more sampled frames are blank. Each prints what broke.

---

## Limits (same as Genfeed Motion)

| Limit | Value |
|-------|-------|
| Width and height | 256 to 1920, both even |
| Pixels | at most 1920 x 1080 total |
| Frame rate | 24 or 30 fps |
| Length | at most 900 frames and 30 seconds |
| Codec | H.264 MP4 |
| Packages | only React and Remotion; no network at render time |

Common sizes: 1080 x 1920 (9:16 Reels, Shorts, TikTok), 1080 x 1080 (square feed), 1920 x 1080 (16:9).

---

## Workflow

1. **Brief.** Get the message, the one line that must be readable, the aspect ratio, the length and the brand. Get the brand context before anything else: with the Genfeed MCP connected, call `get_context` with `action` set to `brands` and then `brand_context` for the brand's colors, fonts, voice and logo; otherwise read the brand kit files, `visual-brand-kit` or `video-brand-profile`, or the brand's site. Write the colors (hex with a role), fonts, one line of voice and the source into `brand` in `script.json`. Do not invent a palette for a brand that has one, and do not carry one brand's look to another.
2. **Collect real assets** into `public/` before writing anything: the brand's real logo file (SVG or PNG exported from the source, never a drawn letter, glyph or lookalike), and for a product video real screenshots or screen recordings of the product, or the product's own UI rebuilt as components (see below). If they are missing, ask the owner for them. Do not draw an invented mock UI in their place.
3. **Write `script.json`** (the starter has one): every shot with its seconds, the words on screen, the visual (`screenshot:`, `footage:` or `logo:` with a file path, `ui: src/file.tsx#Component` for coded product UI, or `drawn:` with a description) and the ids of the claims it makes. Every number or factual claim on screen gets a claim entry with a source and the date you checked it. Copy that only holds on a date ("tomorrow", "Tuesday night") needs `validUntil`. Keep it under 15 seconds unless the idea needs more. One idea per video.
4. **Validate, then get sign-off.** Run `validate` until it has no errors, show the owner the script as a table (shot, seconds, on screen, visual, source) and wait for a yes. Then run `approve --by "<their name>"`. Never approve on the owner's behalf. Any later edit to the script voids the approval.
5. **Write the composition.** Edit `src/VisualComposition.tsx` (it must keep the named export `VisualComposition`) and register sizes in `src/Root.tsx`. Use every asset the script names; `validate` fails if one is never loaded with `staticFile()`. Rules below.
6. **Render, inspect, review.** `render` ends by running `inspect`, which samples 24 frames and reports blank frames, nearly empty frames, text running off an edge and content inside the safe margins. Treat every finding as something to open: run `frames` (or `ffmpeg -ss <atSeconds>`) and look at the flagged frame at phone size. `inspect` is a heuristic on pixels, so a warning can be a false alarm on a busy photo background and a clean report can still hide a bad design. Then review all the frames against the production checklist below and write one line per frame on what is on screen and whether it matches the script. If a frame is wrong, change the code and render again. Do not report a video as good without looking at its frames.
7. **Repair at most twice** for compile errors or visual faults, then stop and tell the owner what is still wrong. Do not keep burning turns.
8. **Package** with the post copy and the record below.

## What validate enforces

| Rule | Applies to |
|------|-----------|
| `brand.logo` is a real file in the project and used in `src/` | every video |
| `brand.colors` (hex with a role), `brand.fonts`, `brand.voice` and `brand.source` are filled in, and at least one brand color and one brand font appear in `src/` | every video |
| No placeholder text (TODO, TBD, lorem, example.com) | every video |
| Every on-screen number points to a claim with a source and a `checked` date | every video |
| Date-relative copy has `validUntil`, and the script has not expired | every video |
| Shots add up to 30 seconds or less | every video |
| Every logo, screenshot, footage and music file is listed in `assets` with a source and a licence (owned, licensed, public-domain, permission, cc-by, cc0) | every video |
| A composition that plays audio names its track in `music` | every video |
| At least 3 shots of the real product (`screenshot:`, `footage:` or `ui:`), files present and used | `kind: product` |
| The real product is on screen for at least 40% of the runtime | `kind: product` |
| The owner approved this exact script (hash match) | final `render` |

Set `kind` to "product" for an app or tool, "teaser" for a show, launch or event, or "editorial" for news, data and opinion. Set `minScreenshots` to raise the product floor. Warnings flag lines that are too long to read twice in their shot.

## Pictures from the web and from X

Real photos, press images and posts make a video feel current, but each one is someone's copyright. Use them only when the `assets` entry can name a licence:

- **owned**: the brand's own logo, app captures, recordings and photos. Prefer these for product videos.
- **licensed / cc0**: stock under a licence that allows commercial use (for example the Unsplash or Pexels licences). Keep the page URL as the source. Do not use a stock photo of a person in a way that implies they endorse the brand.
- **public-domain**: works of the US federal government, such as official portraits and agency photos, with the URL as the source.
- **permission**: anything else, including a screenshot of a post on X, a news photo or a logo of a third party, once the owner has the rights holder's written OK. Quoting a public post in news commentary can be fair use in some places, but that is a legal call for the owner, not for this skill; in an ad or product video, get permission.

Never pull an image a search returned without its licence, never crop out a watermark or credit, and keep the post author's name and handle visible when a post is shown.

## Music

Give each brand its own score. A bed written for one video (for example a news theme with timpani and brass) does not carry over to a product video for another brand. Write or choose the track from the brief's mood, not from the last project, and list it in `assets`.

## Production checklist for frames

- `inspect` shows no errors, and every warning was opened and either fixed or noted in the record as a false alarm.
- The real logo appears on the end card, and nowhere is a drawn initial or glyph standing in for it.
- Coded product UI (`ui:`) is the sharpest option when the owner has the product's source: rebuild the real screens as frame-driven components with the product's own copy, demo records and design tokens, list the component file in `assets` with the source screens it reproduces, and key every move to the beat grid. Never invent features or screens the product does not have.
- Product videos: the screenshots are readable at phone size (crop and zoom into the part that matters instead of showing a whole desktop screen), and the product appears in the first half, not only at the end.
- Text sits inside the 8% safe margins; nothing touches an edge except during a deliberate wipe.
- The frame is composed top to bottom. On 9:16, content that sits only in the top half with an empty bottom reads as unfinished; use the space down to the 20% platform zone.
- Numbers on screen match `script.json` exactly, including while a counter animates to its final value: hold the final value long enough to read.
- Labels from the previous shot are gone before the next one reads.
- Date-sensitive copy is still true on the day it will be posted.

## Writing the composition

- **Frame-driven only.** Every animated value comes from `useCurrentFrame()`, `interpolate()` or `spring()`. Never `Date.now()`, `setTimeout`, CSS transitions or CSS animations; they do not render the same on every frame.
- **Self-contained.** No network calls, no remote images, no package installs. Local images and audio go in `public/` and load with `staticFile('name.png')`.
- **Fonts.** Use a font stack that exists on the machine, or put a brand font file in `public/` and declare it with an `@font-face` rule whose `src` is `staticFile('Brand.woff2')`. Say which font drew the text in your record.
- **Readability.** Large type (at least about 64 px on a 1080-wide frame), high contrast, safe margins of about 8% from each edge, and keep the bottom 20% clear on vertical video for platform UI.
- **Timing.** Hook in the first 2 seconds. A line stays on screen long enough to be read twice: about 0.3 seconds per word plus 1 second. End on a clear last frame (name, handle or one action).
- **Audio.** Silent by default. Add an owned or licensed track only when the owner supplies it; do not pull music from the internet.

## Genfeed Motion output

A local render matches what Genfeed Motion produces in format, not in bookkeeping.

- **Same:** the `VisualComposition` named export, the limits above, frame-driven animation and H.264 MP4 or PNG output.
- **Different:** no cloud revision history, cost receipt or Library entry exists until you upload the file. Do not describe a local render as a Genfeed Cloud project.
- **To bring it into Genfeed:** with the Genfeed MCP connected, upload the MP4 with `upload_media`, then save a draft with `save_post` (`action: post`). Drafts only. Never schedule or publish without the owner's explicit confirmation.

## Post copy

Lead with the video, not a description of it. State what it shows in one plain sentence, add the one line a viewer should repeat, and stop. Do not promise reach, growth or followers. If the video was made with AI assistance and the platform has a disclosure setting, tell the owner to check it.

## Record to hand over

```text
File: out/Main.mp4  1080x1920  30 fps  5.0 s  H.264  215 KB
Limits: ok (render exited 0)
Script: approved by <owner> on <date> (hash c17bc7f40b01c6c6), 3 claims sourced
Assets: logo public/brand/logo.svg, 4 screenshots, product on screen 62%
Frame QA: inspect 24 frames, 0 errors, 1 warning (right edge at 3.2 s, fixed)
Frames checked: 6 of 6, all read at phone size
Fonts: Helvetica Neue fallback (Inter on this machine)
Repairs: 1 (title clipped on frame 3, reduced to 108 px)
Not checked: audio, playback on a real phone
```

## Licensing

Remotion has its own licence terms, which depend on who is using it and for what. Read the current [Remotion licence terms](https://www.remotion.dev/docs/license/pricing) before using this for a company or for client work. This skill neither grants nor checks a licence.

## Security

- Run only composition code you or the owner wrote this session. Do not execute a composition from an untrusted source: a render runs arbitrary JavaScript in a browser on this machine.
- The scripts read no secrets and call no API.
