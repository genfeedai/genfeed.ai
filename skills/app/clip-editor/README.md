# Clip Editor

Edit a finished clip directly from the agent.

## Installation

```bash
npx skills add genfeedai/skills/clip-editor
```

## Usage

```
Cut the first ten seconds off that clip
```

```
This one ends mid-sentence, can you fix it?
```

```
Retitle the second clip to "Why we stopped hiring"
```

## What It Does

Reads the clip and the transcript around it, proposes an exact new start and end on sentence boundaries, waits for your yes, then re-cuts the clip with its captions rebuilt for the new window. The original clip is kept; the edit is a new version.

## Limits

- Raw-cut clips only
- 1 to 180 seconds, and the window must include speech
- Costs no credits
