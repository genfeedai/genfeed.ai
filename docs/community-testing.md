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

- Docker with Compose v2, about 10 GB free disk, and free ports 3000, 3010 and
  3014. The full list is in [Self-Hosting](./self-hosting.md#requirements).
- An [OpenRouter](https://openrouter.ai/keys) key. It is the only required key;
  without it text generation and the agent do not run.
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

Then add your key to `.env` and restart with the same `docker compose` command.

### Known issues in v0.2.13

Two bugs affect a first run. Both have workarounds until a fixed release ships.

**No email/password sign-up page
([#7880](https://github.com/genfeedai/genfeed.ai/issues/7880)).** `/sign-up`
offers only Google and Magic Link, and Magic Link cannot send without an email
provider. Create the first account from a terminal, then sign in in the browser:

```bash
curl -sS -X POST http://localhost:3010/v1/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"email":"you@example.com","name":"You","password":"choose-a-long-password"}'
```

Open `http://localhost:3000/login/password`, sign in, and finish onboarding. If
onboarding says it could not draft posts, the OpenRouter key is missing or not
loaded; check `.env` and restart.

**Agent chat stays on "Reconnecting"
([#7883](https://github.com/genfeedai/genfeed.ai/issues/7883)).** The browser
connects to port 3011, which the bundle does not publish. Save this next to
`compose.yml` as `compose.ws.yml`:

```yaml
services:
  genfeed:
    ports:
      - "3011:3011"
```

and start with both files:

```bash
docker compose --env-file .env -f compose.yml -f compose.ws.yml up -d
```

Skip both workarounds if your release is newer than v0.2.13 and the issues are
closed.

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
   for example: *one paragraph, no blank line, exactly two sentences, under 200
   characters, no claim that pages stay dry or legible, ending with "Open the
   product page."* The hook counts as sentence one and "Open the product page."
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

| Field | What to record |
| --- | --- |
| Version | Release tag or image digest from `docker compose images` |
| Environment | OS, CPU, Docker runtime and version |
| Install | Method, pass or fail, minutes to first page load |
| Sample workflow | How many of the 4 steps above you finished, and where you stopped |
| Cost | What the provider charged for the image step, or "not run" |
| Surprises | Anything unclear, slow or different from this guide |

For a failure, add the exact command, the error text, and the output of
`docker compose logs --tail=100` with keys removed. For a bug that blocks you,
also file the [bug report](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml)
and link it from your test report.

Reports are public. Leave out keys, email addresses, tokens and anything else
you would not post on GitHub.
