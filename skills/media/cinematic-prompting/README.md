# Cinematic Prompting

<!-- generated:start (bun run skills:generate; edit SKILL.md, not this block) -->
Rewrite naive image and video prompts with precise cinematography vocabulary across camera, framing, lighting, lens, color grade, editing, and style.

## Installation

```bash
bunx skills add genfeedai/skills --skill cinematic-prompting
```
<!-- generated:end -->

## Usage

```
Rewrite this image prompt with cinematic vocabulary: shot from above looking down, moody
```

```
Make this video prompt cinematic: camera moves toward him slowly
```

```
Turn "two people talking, wide" into a technical shot description
```

```
Give corrective feedback on this failed generation using Problem → Goal → Correction
```

## What It Does

- **Lexicon of 140+ named techniques**: camera movement, framing/composition, lighting, lens and optics, color and grade, editing/transitions, and stylistic effects
- **Naive-to-technical translation**: "from above" → high-angle shot, "moody" → low-key, "blurry background" → shallow depth of field
- **Subject preservation**: characters, names, and objects stay verbatim while spatial/mood language is upgraded
- **Draft-resolution testing**: 2–3 cheap waves at low resolution on the full-quality model — never a mini variant
- **Corrective feedback grammar**: Problem → Goal → Correction instead of bare dislike
- **Genfeed integration**: in-app prompt enhancement for image and video categories consumes this lexicon as static bundled guidance

## License

MIT
