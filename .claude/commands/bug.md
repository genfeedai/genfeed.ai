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
2. Search existing issues for duplicates before filing. If a clear duplicate is
   open, comment on it instead of opening a second one, and say which one it was.
3. Draft a structured report — title, summary, steps to reproduce, expected vs
   actual, environment — from what you provided. Unknowns are marked, never invented.
   Pasted errors/stack traces are quoted verbatim.
4. Create the issue with `--type Bug` (or `--label bug` fallback), applying only the
   labels/assignee/milestone you named, and return the issue URL. Print the filed
   report so it is in the transcript.

## Gates

- File without asking. `/bug draft` is the way to preview; do not ask for
  confirmation on the default path.
- Never fabricate reproduction steps, versions, or behavior — mark gaps as not provided.
- Files bugs only; for feature requests or tasks, use the matching issue type.
- No YAML frontmatter in issue bodies, and no priority labels — priority lives in
  the project board.
- To root-cause before filing, use `debug` / `systematic-debugging`; for a failing
  CI check, use `gh-fix-ci`.
