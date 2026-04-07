# QA-First Frontend Workflow

This directory contains automated QA verification artifacts for frontend changes.

## Purpose

AI agents perform frontend QA verification **before** handing off UI changes, eliminating the user as the testing bottleneck.

## Workflow

### When QA Runs

**Always run after:**
- Any file in `apps/app/`, `apps/admin/`, `apps/website/` is modified
- Any file in `packages/ui/` is modified
- Any file in `packages/hooks/` is modified
- User explicitly requests UI verification

**Skip for:**
- Backend-only changes (`apps/server/`)
- Test files, docs, configs
- Type-only changes

### Steps

1. **Detect Changed Files** - Identify which app was modified
2. **Verify Dev Server** - Check if the app's dev server is running
3. **Run Visual Verification** - Use browser automation
4. **Generate QA Report** - Save report and screenshots
5. **Present Summary** - Show pass/fail status to user

## App Port Mapping

| App | Dev Command | Port |
|-----|-------------|------|
| Studio | `bun dev:app @genfeedai/app` | 3102 |
| Admin | `bun dev:app @genfeedai/admin` | 3101 |
| Website | `bun dev:app @genfeedai/website` | 3105 |

## Directory Structure

```
.agents/QA/
├── README.md           # This file
├── TEMPLATE.md         # Report template
├── reports/            # QA reports per task
│   └── YYYY-MM-DD-{feature}.md
└── screenshots/        # Visual artifacts
    └── YYYY-MM-DD/
        └── {feature}/
            ├── desktop.png
            └── mobile.png
```
