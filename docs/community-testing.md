# Test Genfeed Community and send us the result

This guide is for people trying the self-hosted Community edition for the first
time. It takes one install, one sample brief and one report. Everything runs on
your machine; nothing is published to any social account.

If you only want help running it, use
[Q&A](https://github.com/genfeedai/genfeed.ai/discussions/categories/q-a). If you
found a reproducible bug, use the
[bug report form](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml).
Use the test report form below to tell us what worked, even if nothing broke.

## What you need

- Docker with Compose v2, at least 15 GB free disk plus space for media and
  backups, and free ports 3000, 3010, 3011 and 3014. This is capacity guidance;
  see [Self-Hosting](./self-hosting.md#requirements) for the reported image sizes.
- A real [OpenRouter](https://openrouter.ai/keys) key configured before startup.
  It is the only required provider key; empty or placeholder values stop the
  container before services run.
- Optional, only for the image step: a `FAL_API_KEY` or `REPLICATE_KEY`. Your
  provider bills you directly. Genfeed shows the model and price before it
  generates; read it and cancel if it is not what you expect.

Use throwaway keys with a low spending limit if you can. Never paste a key into
an issue, a screenshot or a log.

## 1. Install

Follow [Quick Start](./self-hosting.md#quick-start), or run
`npx @genfeedai/create my-genfeed`. Note these as you go; the report asks for
them:

- Which method you used, and your OS, CPU architecture and Docker runtime.
- Whether the checksum check passed.
- Minutes from `docker compose up -d` until `http://localhost:3000` loads.
- Anything that differed from the guide.

The wizard writes your OpenRouter key before starting Docker. If you use the
release bundle, set `OPENROUTER_API_KEY` in `.env` before the first start. After
later changes, recreate the stack with the same Compose command; a plain
`restart` does not re-read `.env`. Startup checks the key's format, not provider
balance or model access.

### Create an account and check live chat

On a default install, open `http://localhost:3000/sign-up` and choose **Email &
password**, then finish onboarding. No mail provider or Google client is needed.
Your account gets its own organization and brand, separate from the seeded
`default` workspace. **Magic Link** requires `RESEND_API_KEY`; Google sign-in
works only with both `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

The v0.2.15 bundle already publishes WebSocket port `3011` on `127.0.0.1`;
it needs no additional Compose override. Keep the browser endpoint reachable.
For a browser on another machine, use the reverse-proxy setup in
[Self-Hosting](./self-hosting.md#troubleshooting).

The [v0.2.15 verification receipt](https://github.com/genfeedai/genfeed.ai/issues/7883#issuecomment-6398021657)
records a fresh account and two live composer turns without reloading, using
deterministic local model responses. That verifies local signup and chat
transport; it does not establish paid-provider generation. The sample below
uses your configured provider account and its billing terms.

## 2. Run the sample brief

The brief below is for a fictional product, so you can run it without a brand of
your own. In **Settings → Brands → Add Brand**, create a brand named "Trailhead
Notebook" (onboarding creates a different default brand and has no name field).
Open the **Agent** page from the left rail and give it the brief as written.
If the brand picker in the Agent top bar does not switch brands, open the Agent
page from the brand's own workspace URL (`/<your-org>/trailhead-notebook/agent`;
your org name comes from onboarding).

> **Brief: Trailhead Notebook, spring field kit**
>
> Trailhead Notebook is a fictional weatherproof paper notebook for hikers.
>
> **Objective:** get people to open the product page.
> **Audience:** weekend hikers who keep a trip log.
> **Tone:** plain, specific and a little dry. No hype, no exclamation marks.
> **Creative direction:** one concrete moment, such as writing a note with wet
> hands at a trail junction. Show the product doing one job.
> **Rules:** do not invent reviews, customer numbers, awards, results or product
> features beyond "weatherproof paper notebook". Do not claim the pages stay dry
> or the ink lasts.
> **Format:** each post is one paragraph of two plain sentences, no line breaks,
> under 280 characters, and ends with the words "Open the product page."
> **Deliverables:** three X post drafts, and one 16:9 image that fits the
> strongest draft.
> **Constraint:** nothing is published; drafts stay in review.

What to do with it:

1. Ask for the three drafts. Expect to see only the first one in the thread
   ([#7884](https://github.com/genfeedai/genfeed.ai/issues/7884)); ask for them
   one at a time if you want to compare. Pick one and write down why.
2. Expect the first set to miss the format: in our test runs every draft broke
   "one paragraph, two sentences" and some made a durability claim the brief
   forbids. That is the point of this step. Reject one and send a correction,
   for example: _one paragraph, no blank line, exactly two sentences, under 200
   characters, no claim that pages stay dry or legible, ending with "Open the
   product page."_ The hook counts as sentence one and "Open the product page."
   as sentence two. Check the next version against your own rules.
3. Optional, needs a provider key: ask for the image. The agent shows a card
   with the model and credit cost. Approve it to generate, or decline to stop. A
   self-hosted install shows credits, not dollars; your provider bills the
   real cost. Note the model, the credits shown and the time it took, and whether
   the image invents product details the brief did not give.
4. Check that nothing was posted: no social account is connected, and a "Create
   post" card is only a proposal until you approve it, even when the agent says
   a draft is "waiting in review".

## 3. Send your report

Open a [test report](https://github.com/genfeedai/genfeed.ai/issues/new?template=test-report.yml)
and fill in:

| Field           | What to record                                                    |
| --------------- | ----------------------------------------------------------------- |
| Version         | Release tag or image digest from `docker compose images`          |
| Environment     | OS, CPU, Docker runtime and version                               |
| Install         | Method, pass or fail, minutes to first page load                  |
| Sample workflow | How many of the 4 steps above you finished, and where you stopped |
| Cost            | What the provider charged for the image step, or "not run"        |
| Surprises       | Anything unclear, slow or different from this guide               |

For a failure, add the exact command, the error text, and the output of
`docker compose logs --tail=100` with keys removed. For a bug that blocks you,
also file the [bug report](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml)
and link it from your test report.

Reports are public. Leave out keys, email addresses, tokens and anything else
you would not post on GitHub.
