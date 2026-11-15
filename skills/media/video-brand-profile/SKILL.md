---
name: video-brand-profile
description: Define and apply a reusable video brand profile (logo or signature placement, caption font and position, thumbnail rules, export sizes) so every clip, Short, recap and thumbnail looks like one channel. Use before editing or packaging video, or when asked where the logo goes, which caption font to use, or to write a video brand kit.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
  short-description: "Define and apply a reusable video brand profile: signature placement, caption font and position, thumbnail rules and export sizes"
  tags: video, branding, captions, thumbnails, logo, youtube, tiktok
  outputs: json, markdown
  triggers: "video brand profile; where does the logo go; caption font and position; video brand kit; thumbnail style rules; channel visual identity for video"
  references: "{\"ship-shit-show.profile.json\":\"Complete worked example\"}"
---

# Video Brand Profile

A profile is one file that answers every visual question an editor, a captioning step or a thumbnail generator would otherwise guess. The platform skills (`youtube-shorts`, `youtube-thumbnail`, `tiktok-video` and the title and description skills) read it first. Without a profile they produce a generic result.

## When to use

- Before the first clip, Short, recap or thumbnail for a channel.
- When two cuts of the same channel look different.
- When a team member or tool needs "the logo spot" and "the caption font" in writing.
- When a brand kit exists as prose and has to become values a renderer can use.

## Workflow

1. **Collect what already exists.** Brand kit, past exports, the last published thumbnail and Short, the avatar and the logo files. Read the real files, not a description of them.
2. **Fill the profile** (fields below). Take every value from a source and write the source next to it.
3. **Mark each value** `approved` (the owner decided it), `built` (inferred from a shipped edit) or `proposed` (you chose it). Never present a proposal as approved.
4. **Ask only about gaps.** One question per missing decision, with your recommendation. Do not re-ask what a source already answers.
5. **Save it** next to the brand's other files and name it in every handoff.
6. **Record the profile version** with each export so a later edit can be compared with it.

## Profile fields

| Field | What it fixes |
|---|---|
| Identity | Full name, baseline, handles per platform, spelling rules |
| Colors | Dark, light, one accent, muted text. Hex values |
| Typography | Family and weight for captions and thumbnail text, at most two families |
| Signature | Mark geometry, color per context (edited video, live, on light), exclusions |
| Signature placement | Position and size per format (16:9 thumbnail, 9:16 cover, slate, in-video, end card) |
| Captions | Font, case, color, backing, size, line count, words per group, vertical position |
| Clip layout | How sources are cropped and stacked, header, audio loudness, encode settings |
| Thumbnails | Subject rule (faces or not), background, text rule, variants per video, canvas and export sizes |
| Copy rules | Name spelling, title length, hook rule, hashtags, description footer, forbidden patterns |
| Handoff record | What every export must record |

A complete worked example is in [references/ship-shit-show.profile.json](references/ship-shit-show.profile.json).

## Placement math

Define placement as ratios of the canvas width so it survives every export size.

- Pick one reference canvas (for example 1280 x 720) and write the mark's viewport and the inset in pixels.
- Convert: `widthRatio = viewport / canvasWidth`, `insetRatio = inset / canvasWidth`.
- For another size multiply by that canvas width. A 96 px mark with a 48 px inset on 1280 x 720 is 7.5% and 3.75% of the width, so it is 288 px with a 144 px inset on 3840 x 2160.
- Use the same inset on the right and the bottom so the mark sits on a square corner grid.
- Keep the mark an exact vector or an exported PNG of the vector. Never a font glyph, never a crop of a larger board.

## Rules

- The profile is a contract for look, not permission to publish, spend or upload.
- If a source says a value is superseded, do not use it. Keep it as provenance only.
- Platform interface zones (Shorts and TikTok overlays) have no official pixel numbers. State your zone, call it a working value and verify on a phone.
- When a rule conflicts with a platform's current specification, the specification wins. Recheck linked specs at each release.
- A rendered file proves the render. Say separately whether anyone watched it.

## Using it with Genfeed

A Genfeed brand can hold part of this profile today: a logo watermark (text or logo, opacity, one of four corners), a caption font family, primary and secondary colors, an end card and uploaded fonts. Size, inset, per-context mark color, caption position and thumbnail rules are not brand settings yet, so keep them in this profile and pass them in the prompt or the editing step.
