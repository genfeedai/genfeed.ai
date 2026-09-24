# Native collection capability qualification

Documentation checked 2026-09-24 for #5092. This matrix is a qualification record,
not proof of application approval or a rollout switch. Fixtures prove adapter
behavior; they do not prove production access. No provider canary, paid comparison
or application submission is part of this change.

## Public and connected collection

| Capability | Scope and access | Coverage and media | Quota, retention and readiness |
| --- | --- | --- | --- |
| YouTube public uploads | Public posts by canonical channel ID or handle; server `YOUTUBE_API_KEY`; channel owner OAuth unnecessary | Bounded uploads metadata, provider counters, thumbnails and watch links. No private videos, ads inventory, inferred Shorts or downloadable audiovisual media | `channels.list`, `playlistItems.list`, `videos.list`: 1 quota unit each. Adapter bounds: 100 results default, 500 maximum, 10 playlist pages, 15 seconds/request, no retry. Maximum 21 requests. Refresh/delete public API data within 30 days. Fixture implementation; application access and rollout unverified |
| YouTube own channel | Existing `YoutubeOfficialProvider`, organization/brand/account credential, OAuth | Credential channel's uploads; private authorized context must remain tenant-scoped | Existing route preserved. Public adapter does not establish own-account access or media reuse rights |
| Instagram Business Discovery | Existing `InstagramBusinessDiscoveryProvider`, connected eligible professional account and provider permissions | Supported public professional accounts; not consumer/private accounts or competitor ad inventory. Preserve missing fields and source media restrictions | Existing bounded provider; exact app permissions, current API-version qualification and media-use approval require evidence before expanded rollout |
| Instagram, TikTok, LinkedIn own account | Existing official providers with credential/organization/brand boundaries | Authorized account posts and eligible analytics; not arbitrary competitor coverage | No route expansion. Existing credentials are not proof of transparency API access |
| X public reads | Existing app-bearer provider; separately qualified X API entitlement | Public posts allowed by exact API access; not a universal ads library | Usage-based credits/pricing must be accounted for. Native does not mean zero cost; no allowance changes in this migration |

Official references: [YouTube uploads flow](https://developers.google.com/youtube/v3/guides/implementation/videos),
[channel filters](https://developers.google.com/youtube/v3/docs/channels/list),
[playlist quota](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[video quota](https://developers.google.com/youtube/v3/docs/videos/list),
[YouTube data and audiovisual policies](https://developers.google.com/youtube/terms/developer-policies),
[LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api),
[X pricing](https://docs.x.com/x-api/getting-started/pricing).
The Instagram qualification above describes the existing adapter boundary; current
Meta reference retrieval was rate-limited, so it is not a fresh approval claim.

## Transparency APIs: independent access gates

| Capability | Documented coverage | Credential / approval | Available media and downstream policy | Qualification blocker |
| --- | --- | --- | --- | --- |
| Google Ads Transparency Center | Ads served in the EEA. Outside-EEA API access may be offered to regulators/self-regulatory organizations; do not generalize it to this application | Exact transparency access required; Google Ads account-management OAuth/developer token is insufficient | Exact approved fields, retention, quota/pricing and reuse rules must be obtained with access; no guessed endpoint or media schema | No verified application grant or approved response contract; disabled |
| Meta Ad Library commercial ads | Official landing page documents all ad types delivered to EU or UK in the past year. Some parameter notes still mention only EU; verify exact region against approved access before enabling | Identity/location confirmation, developer account, app and Ad Library token/access | Library ID, creative content under terms, Page attribution, delivery dates/platforms; snapshot links are not downloadable creative assets. No import permission inferred | Exact app access, rate limits, permitted region and retention/media-use evidence unverified; disabled |
| Meta political/issue ads | Separate capability: documented worldwide delivery archive up to seven years, subject to availability | Ad Library access, not Marketing API account access | Additional spend/impression ranges and demographic reach are ranges, not exact performance. Same conservative media policy | Approval and actual scoped availability unverified; disabled independently of commercial capability |
| TikTok Commercial Content ads | Product page says EU-only; newer supported-country reference lists EU, EEA, UK and Switzerland. Do not resolve this contradiction into worldwide coverage. Query date minimum is within one year | Approved Commercial Content research client + client access token; Display API and separate Research API access are insufficient | Ad details can expose video/image URLs and advertiser metadata. URLs may expire; presence does not grant download/remix rights. Preserve missing media and targeting versus advertiser country distinctions | Actual project approval, entitled regions, quota/pricing, retention and media-use evidence unverified; disabled |

Sources: [Google transparency](https://support.google.com/adspolicy/answer/13733850?hl=en&co=GENIE.CountryCode%3DMT),
[Meta Ad Library](https://www.facebook.com/ads/library/api/) (official
[localized page](https://br-fr.facebook.com/ads/library/api/?source=archive-landing-page) was accessible),
[TikTok product](https://developers.tiktok.com/products/commercial-content-api),
[approved client setup](https://developers.tiktok.com/docs/en/commercial-content-api-getting-started),
[supported countries](https://developers.tiktok.com/docs/en/commercial-content-api-supported-countries),
[query contract](https://developers.tiktok.com/docs/en/commercial-content-api-query-ads),
[ad details](https://developers.tiktok.com/docs/en/commercial-content-api-get-ad-details).

Archive availability is not permission to retain a local copy for the same period.
No blanket commercial download or remix grant is established by these references.
Blocked transparency access must not block the independent public YouTube adapter.

## Adapter and routing contract

The public YouTube adapter is `YoutubePublicProvider`, provider `app-api-key`.
It supports handles and exact-case `UC` channel IDs, not ambiguous legacy `/c/`
or `/user/` aliases. Source normalization must preserve channel IDs. Public
collection uses fixed Google API endpoints; it never fetches caller-provided URLs.

Successful empty uploads are a successful result and must terminate the collector
chain. Unsupported inputs, unavailable access, quota failure and malformed provider
responses are failures, never fabricated empty content. Provider errors must not
expose request configuration or API keys. Pagination stops at the requested bound,
window, repeated token or hard page ceiling; it does not claim full channel history.

Post identity is the upstream video ID, shared across collection methods. The watch
URL belongs in `contentUrl`; `mediaUrls` is empty. Native counts remain absent when
missing/invalid. Watch links enable navigation, not a promise of playback in every
region or a supported media import. Runtime alone does not establish Shorts format.

#5091 owns module/service registration, fallback eligibility, shared result types,
cache, retention, entitlement and budget. It must preserve provenance and partial
coverage through persistence, suppress paid fallback after empty success, and
apply the governed policy after any failure. #4069 owns downstream source eligibility:
YouTube public data supplies no downloadable Remix asset. A named pattern-only path
may use eligible references without representing them as importable source media.

Before enabling a capability, record verified access, exact permissions/regions,
quota/pricing, freshness/retention, media-use policy and a sanitized response fixture.
Readiness states are `unconfigured`, `approval-pending`, `ready`, `quota-limited`,
`degraded` or `unsupported`; a configured token alone cannot establish `ready`.
Unconfigured/blocked adapters remain disabled. This document does not implement a
runtime readiness registry or replace those enforcement gates.

## Truthful LinkedIn empty results

Configured/default company URLs are collection inputs. They do not establish an
observed post, hashtag, mention count, growth rate or publication time. The provider
returns no trends when collection fails or yields no observed topics. It never
converts a seed URL into a trend to populate the grid. #5091 owns exclusion of
historical fabricated rows and the explanatory empty state. Empty-state rendering
must never itself initiate a paid scan.

Observed scraped aggregate topics remain a distinct existing capability. Their
weighted scores do not prove measured growth over time or native post identity;
removing the seed fallback does not make those aggregates native posts.

## Rollout evidence still required

- Exact application access and a permitted read-only canary for each capability.
- Collector integration with explicit coverage, retention enforcement and media
  restrictions surviving normalization; an unwired adapter is not a migration.
- Fixture parity and current-head checks, including no redundant paid start on
  native success/empty success and bounded behavior on quota/access failure.
- One approved ad-library adapter before retiring its fallback; unapproved
  providers remain blocked independently.
- Cost per usable result, quota, latency and media yield compared with the governed
  baseline, without double production schedules or unapproved spend.
- Reversible per-capability routing and observed removal/expiry handling.
