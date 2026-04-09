# Repo Skills

This directory is the canonical home for repo-local skill bundles in the
genfeed.ai workspace.

`.codex/skills/` is a symlink alias to this directory so Codex-style runtimes
can discover the same skills without duplicating files.

## Required `SKILL.md` Format

Every skill file must start with YAML frontmatter delimited by `---`.
If frontmatter is missing, the skill loader may skip that skill.

Minimum required pattern:

```md
---
name: your-skill-name
description: Short summary of what this skill does.
---

# your-skill-name
...
```

## Quick Validation

Use this check to confirm frontmatter exists in all local skill files:

```bash
for f in .agents/skills/*/SKILL.md; do
  head -n 1 "$f" | grep -q '^---$' || echo "Missing frontmatter: $f"
done
```
