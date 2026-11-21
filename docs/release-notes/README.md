# Release notes

One file per stable release, named `<tag>.md` (for example `v0.3.4.md`). The file
is the Discord patch notes for that release: what a customer notices, in plain
language, grouped under bold headings. It is not a list of pull requests; the
GitHub release already carries the generated changelog.

Merge the file before the release is cut, together with the version bump. When a
Release run succeeds, `.github/workflows/announce-release.yml` posts the file to
the announcement channel with the repository secret `DISCORD_RELEASE_WEBHOOK_URL`.
To post a release by hand, run **Announce release** from the Actions tab with the
tag.
