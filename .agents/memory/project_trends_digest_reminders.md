---
name: trends digest reminders after live
description: Daily/weekly trend reminders are a real product, shipped only after the Trends surface is live for good
type: project
status: active
last_verified: 2026-08-27
topics: [trends, workflows, notifications, email]
---

**Rule:** Daily and weekly reminders of the Trends app are a product to build. Do not ship them, and do not send unsolicited trend digest email or in-app pings to customers, until Trends is live for good.

**Why:** A seeded Daily Trends Digest workflow emailed every org owner with no opt-in (Resend “Your daily trends”). That was a workflow proof left on, not a launched feature. The reminder product is real; premature delivery is not.

**How to apply:**
- Keep digest and trend-summary **email** off for customers until Trends is a launched surface they can open and use.
- When Trends is live, build **daily / weekly reminders** of that app (in-app first; email only as an explicit opt-in).
- Do not hardcode operator inboxes into product send paths. Pause or opt-in by workflow schedule and user settings.
- The current `trend-summary-notifications-*` in-app default is a stub (`type: 'discord'`), not that reminder product. Do not treat it as shipped.
- Hosted SaaS deploys must not re-enable paused Daily Trends Digest clones as a side effect of workflow backfill.
