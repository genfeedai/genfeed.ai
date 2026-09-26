# Content Reviewer

Expert content quality reviewer and editor. Scores content across six dimensions (clarity, brand voice, hook strength, CTA effectiveness, platform fit, factual accuracy) with a max score of 30. Provides actionable rewrite suggestions, A/B variants, and platform-specific feedback.

Now includes a publish-readiness gate with a claim ledger, revision packet, and variant comparison so content can move through a factory queue without losing why it passed, failed, or needs another production pass.

## Installation

```bash
bunx skills add genfeedai/skills/content-reviewer
```

## Usage

```
Review this content for our Instagram post: "Ready to transform your morning routine? Our new blend..."
```

```
Score this LinkedIn post and suggest improvements
```

```
Is this tweet ready to publish? "We just launched..."
```

```
Run a quick checklist on this blog intro
```

```
Compare this post against our brand voice guidelines
```

## What It Does

- **Six-dimension scoring** (1-5 each, max 30): Clarity, Brand Voice Alignment, Hook Strength, CTA Effectiveness, Platform Fit, Factual Accuracy
- **Score interpretation**: 25-30 Ship it, 20-24 Minor tweaks, 15-19 Needs revision, Below 15 Rewrite
- **Per-dimension feedback** with specific rewrite suggestions
- **A/B variant generation**: 2-3 alternative versions of the weakest elements
- **Checklist mode**: Quick pass/fail on critical items (grammar, links, hashtags, media, CTA)
- **Publish-readiness gate**: PASS/FAIL decision with blocking issues and approval recommendation
- **Claim ledger**: Classifies risky claims as sourced, inferred, opinion, or unsupported
- **Revision packet**: Sends failed drafts back to the right producer with exact changes needed
- **Variant comparison**: Compares rewrites against expected upside and newly introduced risk
- **Platform-specific criteria**: Character limits, tone, format requirements per platform
- **Brand voice comparison**: Analyze against guidelines, flag deviations, suggest corrections
- **Genfeed integration**: Uses `rate_content` for scoring, references brand voice profiles

## License

MIT
