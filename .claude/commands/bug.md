# Bug - File a GitHub Bug Issue

Turn a description of something broken into a clean GitHub issue of type **Bug**.
Drafts a structured report and files it immediately — typed `Bug` where the repo
supports issue types, otherwise labelled `bug`. Use `/bug draft` when you want to
read it over first.

## Usage

```bash
/bug <description>   # draft a bug report from the description and file it (default)
/bug                 # draft from the current context / recent error and file it
/bug draft <desc>    # draft and print the report only — create nothing
```

## Workflow

1. Detect the repo (from the current remote) and whether it supports a `Bug` issue
   type or needs the `bug` label fallback. Stop if issues are disabled.
2. Search existing issues **and open pull requests** for duplicates before filing. If
   a clear duplicate is open, comment on it instead of opening a second one, and say
   which one it was.
3. Draft a structured report matching `.github/ISSUE_TEMPLATE/bug.yml` — title,
   summary, current behavior, expected behavior, acceptance criteria (EARS), steps to
   reproduce, environment, evidence — from what you provided. Unknowns are marked,
   never invented. Pasted errors/stack traces are quoted verbatim. Close with the
   template's required `Submission checks` section, each box checked once the
   corresponding gate below actually passes:
   - duplicate search done (step 2)
   - secrets, credentials, personal data, and customer data removed (step 4)
   - no undisclosed security vulnerability publicly detailed (step 4)
4. Redact before showing the report to anyone. Scan the draft — pasted errors and
   stack traces especially — for secrets, credentials, tokens, personal or customer
   data, and undisclosed security-vulnerability detail. Replace what you find with a
   placeholder. This runs before the report is rendered, so `/bug draft` previews are
   redacted too, not only filed issues. If sensitive content cannot be removed without
   gutting the report, stop and say so instead of printing or filing it — this repo is
   public and the transcript is not a safe holding pen.
5. Create the issue with `--type Bug` (or `--label bug` fallback), applying only the
   labels/assignee/milestone you named, and return the issue URL. Print the redacted
   report so it is in the transcript.

## Gates

- File without asking. `/bug draft` is the way to preview; do not ask for
  confirmation on the default path.
- Never fabricate reproduction steps, versions, or behavior — mark gaps as not provided.
- Never file a report still carrying secrets, credentials, personal/customer data, or
  undisclosed vulnerability detail. Filing is immediate and the repo is public.
- Files bugs only; for feature requests or tasks, use the matching issue type.
- No YAML frontmatter in issue bodies, and no priority labels — priority lives in
  the native organization Issue Field surfaced on Project #12.
- To root-cause before filing, use `debug` / `systematic-debugging`; for a failing
  CI check, use `gh-fix-ci`.
