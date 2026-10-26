# Agent chat

## What exists
The Genfeed Agent: a chat workspace that plans and runs content work, including one-off
image and video generation, with a plan-review step, threads, and an agent dock.
Routes: `/agent`, `/agent/new`, `/agent/journey`. Automation agents live under
`/automation/agents`; agent settings under `/settings/agent` and `/settings/agents`.

## How a user reaches it
Sidebar Agent entry, the agent dock on other pages, or `/agent/new` for a fresh thread.

## How to drive it
Page object: `playwright/e2e/pages/agent.page.ts` (`AgentPage`), URL from
`orgPath(APP_ROUTES.AGENT.NEW)`. Selectors:
- chat input: `[data-testid="agent-chat-input-shell"] [contenteditable="true"]`
- heading: `/GenFeed Agent/i`
- plan-mode button: name matching `/^Agent mode:/`
- plan review: `agent-plan-review-card`

Specs: `playwright/e2e/tests/chat/` (`chat-flows`, `chat-flow-interactions`, `chat-extra`,
`plan-mode`, `thread-url-assertions`), `playwright/e2e/tests/agents/` (`agent-surface`,
`runs`, `skills`, `content-team`, `sub-sections`, `automation-*-interactions`),
`playwright/e2e/tests/shell/agent-dock.spec.ts`.

## What usually breaks
- The chat input is contenteditable; `fill` on the shell div does nothing — target the
  inner contenteditable.
- Thread URL assertions race the redirect from `/agent/new` to the thread id; wait for the
  URL, not a fixed delay.
- Streaming responses come from the API/event stream; in mocked specs the stream must be
  mocked end to end or the UI waits forever.
- Tool approvals surface as notifications; see `shell-sidebars.md`.
