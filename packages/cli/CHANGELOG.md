# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `gf organizations` is registered on the program. The command (`organizations`,
  `organizations select`, `organizations current`) was implemented but unreachable from the binary.

### Changed

- Agent threads resolve against scoped organization/brand context in `gf chat` and the agent shell
  (#1691).
- Organization and element API calls follow the collapsed REST paths (#2225).

### Fixed

- `gf --version` reports `0.4.1`, matching `package.json`, instead of the stale `0.4.0` literal.
  A registration test now fails if the two drift apart, or if a command module is never registered
  on the program.
- `gf publish` and `gf workflow` send the corrected payload shapes surfaced by the local QA pass
  (#2366).
- `gf generate image` and `gf generate video` now send `brandId` instead of `brand`. The API DTOs
  declare `brandId`, and the global ValidationPipe strips unknown properties, so the brand was
  silently dropped and generations fell back to the organization's default brand
  (`src/api/images.ts`, `src/api/videos.ts`).
- `gf performance weekly|top|prompts` no longer returns 400. The CLI now sends the query parameter
  names the API reads (`brandId`, `topN`, `worstN`, `limit`, `startDate`, `endDate` instead of
  `brand`, `top`, `worst`, `start`, `end`), fails fast with `NoBrandError` when no brand is
  selected, and parses the real response shapes — `top`/`prompts` return plain arrays, not a
  JSON:API envelope (`src/api/performance.ts`, `src/commands/performance.ts`).

## [0.4.1] - 2026-07-10

### Added

- `gf keys` for API key management (create, list, revoke) plus browser-based and
  `--key`/`--interactive` login flows (#878).

### Changed

- Publishing targets the public npm registry explicitly via `publishConfig.registry` (#1588).
- Agent thread endpoints moved from `/chat` to `/agent` (#1060).
- Mechanical status/field routes collapsed into `PATCH`, and static-filter `GET`s into query
  params, across the CLI's API client (#1360, #1363).
- Generation commands (`image`, `video`, `article`, `article-x`) share one flow through
  `commands/generate/helpers.ts` (#275).
- Auth requests follow the completed Better Auth cutover (#769).

### Fixed

- `gf keys list` paginates through every page instead of showing only the first (#1568).
- `gf workflow list --json` emits an empty array instead of nothing, and `gf whoami` always stops
  its spinner (#431).
- Brand resolution no longer reads the legacy relation alias (#1098).
- Malformed workflow inputs produce a normalized error instead of a raw parse failure.

## [0.4.0] - 2026-04-05

### Changed

- The CLI moved from the standalone `genfeedai/cli` repository into the `genfeed.ai` monorepo at
  `packages/cli`, published as `@genfeedai/cli`. Shared code (`@genfeedai/constants`, `errors`,
  `interfaces`, `serializers`, `tools`) is now consumed as workspace dependencies, and releases ride
  monorepo tags rather than per-repo tags.

## [0.3.1] - 2026-02-25

### Added

- AWS versioned JSON:API helpers (`flattenResource`, `isJsonApiResponse`) remain exported for legacy consumers while the CLI now relies on `flattenSingle`/`flattenCollection`.

### Changed

- `gh workflow run` now posts `workflow` + trigger to `/workflow-executions` and admin commands enforce authentication before checking roles (`src/commands/workflow.ts`, `src/middleware/auth-guard.ts`).
- `gf publish` fetches connected `/credentials`, lets you select platforms/credentials, and sends a `CreatePostDto` payload per target (status/scheduled support + JSON output).
- `gf chat` now talks to `/agent/chat`, saves the returned conversation ID, and surfaces the orchestrator response; `gf personas show` fetches by persona ID.

### Fixed

- CLI auth tests pass again thanks to the restored JSON:API exports and extra admin guard check; `bun run test` succeeds.

## [0.1.0] - 2025-01-21

### Added

- Initial release of the Genfeed CLI
- `genfeed login` - Authenticate with API key
- `genfeed logout` - Remove stored credentials
- `genfeed whoami` - Display current user information
- `genfeed brands` - List and select brands
- `genfeed brands select` - Select active brand
- `genfeed generate image` - Generate AI images
- `genfeed generate video` - Generate AI videos
- `genfeed status` - Check generation job status
- Configuration persistence via `conf`
- Colorful terminal output with `chalk`
- Interactive prompts with `@inquirer/prompts`
- Progress spinners with `ora`

[Unreleased]: https://github.com/genfeedai/genfeed.ai/commits/master/packages/cli
[0.4.1]: https://github.com/genfeedai/genfeed.ai/commit/e2db9b113aef92e355c5b5dd7f07eb754b664c63
[0.4.0]: https://github.com/genfeedai/genfeed.ai/commit/e0f441c9de521b1a1f31d0bf8fb8580b96a6bfdc
[0.3.1]: https://github.com/genfeedai/cli/releases/tag/v0.3.1
[0.1.0]: https://github.com/genfeedai/cli/releases/tag/v0.1.0
