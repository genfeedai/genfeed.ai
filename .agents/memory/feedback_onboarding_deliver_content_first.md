---
name: Deliver brand content before account connection
description: Onboarding proactively generates an image and tweet before asking the user to connect a publishing account
type: feedback
status: active
last_verified: 2026-09-23
topics: [onboarding, agent, activation]
---

# Deliver content before asking for a connection

The onboarding sequence is brand context → proactively generated image and tweet → user review → optional account connection to publish. The user should see useful brand-specific output before learning the SaaS workflow or connecting a social account.

**Why:** A blank conversation with indefinite “Working…” feels empty and leaves users lost. Asking for account connection before showing value is premature. The first output should demonstrate an improvement over what the user currently generates; user validation determines whether it meets that bar.

**How to apply:**

- Keep initial brand setup to three small steps: profile selection; optional website plus one shared brand/workspace name; optional audience and tone. Suggest a website from professional email only, derive the name from the website until manually edited, and preserve answers when moving back.
- Have the agent deliver the first draft proactively, without requiring a kickoff prompt.
- Present the draft in a focused, Genfeed-branded onboarding surface with the user's brand context and honest generation progress.
- Use a cost-conscious image model and text generation for the first image plus tweet. No specific model or numeric budget was selected in this decision.
- Let users edit, regenerate, and validate the output before offering account connection for publishing.
- Keep an explicit skip/open-workspace exit and recoverable failure states. Dock the composer at the bottom even without navigation chrome; leave spacing between the hint and composer.
- Reuse agent shortcut styling. Slash commands are the quick-action entry point; do not duplicate them in a lightning-button dropdown.
- Agent assistance remains available, but chat and workspace navigation are not prerequisites to receiving the first output.

This explicit user correction supersedes the conversation-first presentation prescribed in `feedback_onboarding_conversation_prompt_card.md`.
