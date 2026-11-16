# Motion Video

<!-- generated:start (bun run skills:generate; edit SKILL.md, not this block) -->
Author a Remotion composition with your own Claude or Codex sub, render it locally and package it as Genfeed Motion-style output, no model API

## Installation

```bash
bunx skills add genfeedai/skills --skill motion-video
```
<!-- generated:end -->

## Usage

```bash
bun run scripts/motion.ts init ./my-motion
bun run scripts/motion.ts validate ./my-motion
bun run scripts/motion.ts approve ./my-motion --by "Owner name"
bun run scripts/motion.ts render ./my-motion --id Main
bun run scripts/motion.ts inspect ./my-motion/out/Main.mp4
bun run scripts/motion.ts frames ./my-motion/out/Main.mp4 --count 6
```

Every video starts as `script.json`: shots, on-screen words, real assets (logo, product screenshots) and a source for every claim. `validate` checks it, `approve` records the owner's sign-off, and `render` refuses to run until both pass (`--draft` makes a review render). `render` then checks the result against the Genfeed Motion limits (even sides, 256 to 1920, at most 1920 x 1080 pixels, 24 or 30 fps, 900 frames, 30 seconds) and exits non-zero if one is broken. It then runs `inspect`: 24 sampled frames checked for blank frames, text cut by an edge and content inside the safe margins (a heuristic on pixels, so open every flagged frame). `script.json` also carries the brand's colors, fonts, voice and source, and `validate` checks the composition actually uses them.

Check the [Remotion licence terms](https://www.remotion.dev/docs/license/pricing) before commercial use. See `SKILL.md` for the workflow.

## License

MIT (this skill). Remotion is licensed separately.
