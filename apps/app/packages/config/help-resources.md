# Help resources

The canonical page is `/<org>/~/settings/help`; `/settings/help` re-exports it for personal settings. Neither page needs organization or brand bootstrap data. Character settings link to its `#characters` section.

`help-resources.config.ts` defines seven stable resource IDs and the responsible owner. Documentation owns the self-hosted guides, Studio guide and FAQ; the website Help articles (`genfeed.ai/articles`, category `help`) own the Cloud getting-started path; product owns release notes and Cloud support; community owns the community destination; the installation operator owns self-hosted support. These ownership identifiers are configuration metadata, not support entitlements.

Public destinations pass through `EnvironmentService.help`. Configure these **at frontend build time**, as with other `NEXT_PUBLIC_*` settings. An explicitly empty value disables a destination. Missing overrides use the defaults below, except self-hosted support, which intentionally has no Cloud fallback.

| Resource | Public environment variable | Default |
| --- | --- | --- |
| Documentation | `NEXT_PUBLIC_HELP_DOCUMENTATION_URL` | `https://docs.genfeed.ai` |
| Cloud getting started | `NEXT_PUBLIC_HELP_GETTING_STARTED_URL` | `https://genfeed.ai/articles/getting-started-with-genfeed-cloud` |
| Self-hosted getting started | `NEXT_PUBLIC_HELP_SELF_HOSTED_START_URL` | `https://docs.genfeed.ai/self-host/installation` |
| Workflow learning | `NEXT_PUBLIC_HELP_WORKFLOWS_URL` | `https://docs.genfeed.ai/guides/studio` |
| FAQ | `NEXT_PUBLIC_HELP_FAQ_URL` | `https://docs.genfeed.ai/faq` |
| Changelog | `NEXT_PUBLIC_HELP_CHANGELOG_URL` | `https://genfeed.ai/changelog` |
| Cloud support | `NEXT_PUBLIC_HELP_CLOUD_SUPPORT_URL` | `https://genfeed.ai/contact` |
| Self-hosted support | `NEXT_PUBLIC_HELP_SELF_HOSTED_SUPPORT_URL` | Unconfigured; ask the installation operator |
| Community | `NEXT_PUBLIC_HELP_COMMUNITY_URL` | Existing `EnvironmentService.social.discord` configuration |

The deployment selector uses the canonical `isSelfHostedDeployment()` boundary. Only the applicable support and getting-started destinations are rendered. Both editions can read the common product and workflow guides; self-hosted installations can override them with locally hosted documentation. Workflow learning directs users to the Studio guide in the documentation (shared by both editions) and explains where to find Automation → Templates in their selected brand; it does not recreate onboarding or guess a brand scope.

Destinations must be absolute HTTP(S) URLs without embedded credentials. Invalid, blank, or missing destinations remain readable cards with recovery guidance and no link. External links identify that they open a new tab and use `noopener noreferrer`. No browser request is made merely to render a help card, so offline installations retain the in-app learning path and character answers. This is configuration validation, not a promise that an external website is online.

The character answers describe the current generation-sheet approval, existing-image save action, duplicate detection, and explicit `@handle` selection. Keep these answers aligned with the Characters and SaveAsCharacter components when those flows change.

Cloud docs pages were retired when docs.genfeed.ai became self-host only; Cloud help content now lives in the `help` article category on the website and the destinations above were chosen so no default depends on a docs redirect. Re-verify the default destinations before changing them. Component and configuration tests cover both editions, partial/unavailable configuration, unsafe URLs, external navigation semantics, and accessible character answers.
