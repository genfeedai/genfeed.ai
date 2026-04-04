# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/genfeedai/cli/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/genfeedai/cli/releases/tag/v0.3.1
[0.1.0]: https://github.com/genfeedai/cli/releases/tag/v0.1.0
