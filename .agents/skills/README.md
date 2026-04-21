# .agents/skills/

Dev and build skills for the Genfeed.ai monorepo. These guide AI agents when building, testing, and maintaining the codebase.

## What belongs here

- Framework skills (React, NestJS, Tailwind, TypeScript)
- Build tooling skills (Docker, Turborepo, Biome)
- Quality skills (code review, refactoring, security audit)
- Architecture skills (scaffolding, package design, serializer patterns)
- Repo-specific guards (multitenancy-guard, prepush-guard, serializer-boundary)

## What does NOT belong here

- Product/content skills (content creation, publishing) — those go in `skills/` at repo root
- Personal/local skills — those go in `~/.agents/skills/` (not committed)

## How `.claude/skills/` works

`.claude/skills/` contains symlinks pointing to `../../.agents/skills/<name>`. This is how Claude Code discovers project-level skills. All symlinks are internal to the repo — no external paths.

To add a new skill to Claude Code discovery:

```bash
ln -sf ../../.agents/skills/my-skill .claude/skills/my-skill
```

## Adding a skill

Create a directory with at minimum a `SKILL.md` file:

```
.agents/skills/
  my-new-skill/
    SKILL.md        # Skill definition (required)
    plugin.json     # Metadata (optional)
```

### Frontmatter

Every `SKILL.md` must start with YAML frontmatter:

```md
---
name: your-skill-name
description: Short summary of what this skill does.
---
```

### Validation

```bash
for f in .agents/skills/*/SKILL.md; do
  head -n 1 "$f" | grep -q '^---$' || echo "Missing frontmatter: $f"
done
```
