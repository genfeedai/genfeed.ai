---
name: command palette registration is quiet
description: Registering palette commands must not info-log in the browser
type: feedback
---

# Command palette registration stays off the console

Registering a command is internal bookkeeping. Cmd-k hydrates one command
per agent thread (and per brand). `logger.info` maps to `console.info` in
the browser, so a thread list looked like the app was "registering again
and again."

**How to apply:** Command register/unregister/clear is `logger.debug`.
There is one `registerCommand` and one `unregisterCommand`; each accepts
a single value or a list so thread/brand hydration is one `setState`.
Keep `logger.info` for user actions (opened, executed), not hydration.
