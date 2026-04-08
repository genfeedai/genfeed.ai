# @genfeedai/create

Create a self-hosted Genfeed Core project — AI workflow engine you can run locally.

## Quick Start

```bash
npx @genfeedai/create my-app
```

That's it. Dependencies install automatically and the app starts on `http://localhost:4000/onboarding`.

## What it does

1. Downloads the latest `genfeedai/genfeed.ai` template
2. Copies `.env.example` to `.env`
3. Installs dependencies (`bun install` if available, otherwise `npm install`)
4. Starts the dev server — opens to `/onboarding` on first run

## License

AGPL-3.0
