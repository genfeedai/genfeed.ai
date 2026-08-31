# OAuth provider provisioning runbook

This runbook covers the provider-side applications behind Genfeed's Connect
menu: X, Instagram, Facebook and Meta Ads, LinkedIn, Threads, YouTube, TikTok,
Restream, Fanvue, Google Ads, and YouTube Ads. Reddit is documented separately
because it remains hidden until Genfeed has approved Data API access.

The current Connect catalog is defined in
`packages/ui/src/components/constants/oauth-connect-platforms.ts`. Runtime
environment keys are defined by `packages/config/src/schemas/social.schema.ts`
and `packages/config/src/schemas/google-oauth.schema.ts`, then copied from the
root environment by `scripts/env-spec.ts`. Check those files before changing a
provider's products, scopes, or callback.

## Secret and environment handling

- Never commit credentials or paste their values into an issue, pull request,
  log, screenshot, or support ticket.
- For a source checkout, edit only the repository-root `.env.local`, run
  `bun run env:sync local`, and restart the API. Generated app-level env files
  are mirrors and must not be edited directly.
- For a release bundle or hosted deployment, use that deployment's secret
  manager and the same environment-key names. Roll or restart the API after a
  value changes.
- Use separate development and production provider apps when the provider
  supports it. Otherwise, register both callbacks on the same app.
- Redirect URIs must match exactly, including scheme, host, path, port, and
  trailing-slash behavior.

The canonical app origins are:

| Environment | App origin |
| --- | --- |
| Genfeed production | `https://app.genfeed.ai` |
| Source-checkout development | `https://app.genfeed.localhost` |
| Self-hosted deployment | The public origin serving the Genfeed app |

## Callback and API matrix

Every Connect endpoint is `POST /v1/services/{service}/connect`; every callback
is handled by the app and then verified through
`POST /v1/services/{service}/verify`.

| Connect tile | Credential provider | Service | Callback path |
| --- | --- | --- | --- |
| X | X | `twitter` | `/oauth/twitter` |
| Instagram | Meta | `instagram` | `/oauth/instagram` |
| Facebook, Meta Ads | Meta | `facebook` | `/oauth/facebook` |
| LinkedIn | LinkedIn | `linkedin` | `/oauth/linkedin` |
| Threads | Meta | `threads` | `/oauth/threads` |
| YouTube | Google | `youtube` | `/oauth/youtube` |
| TikTok | TikTok | `tiktok` | `/oauth/tiktok` |
| Restream | Restream | `restream` | `/oauth/restream` |
| Fanvue | Fanvue | `fanvue` | `/oauth/fanvue` |
| Google Ads, YouTube Ads | Google Ads | `google-ads` | `/oauth/google-ads` |

Meta Ads reuses the Facebook credential and its ads scopes. YouTube Ads reuses
the Google Ads credential because YouTube campaigns are managed through Google
Ads. Google sign-in, YouTube, Google Ads, and Search Console share one Google
Cloud web client through `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`; each connector still has its own redirect URI.
TikTok derives its callback from `GENFEEDAI_APP_URL`; every other row uses the
provider-specific redirect environment key listed below.

## Provider setup

### X

1. Create a Web App in the [X Developer Console](https://developer.x.com/en/portal/dashboard)
   and enable OAuth 2.0 Authorization Code with PKCE.
2. Register `{APP_ORIGIN}/oauth/twitter` exactly.
3. Enable the permissions represented by the scopes Genfeed requests:
   `tweet.read`, `tweet.write`, `users.read`, `media.write`, `dm.read`,
   `dm.write`, and `offline.access`.
4. Set `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI`,
   `TWITTER_BEARER_TOKEN`, `TWITTER_CONSUMER_KEY`, and
   `TWITTER_CONSUMER_SECRET`.

Reference: [X developer apps](https://docs.x.com/fundamentals/developer-apps).

### Instagram

1. Create a Meta app in the [Meta App Dashboard](https://developers.facebook.com/apps/)
   and configure Instagram API with Facebook Login.
2. Add `{APP_ORIGIN}/oauth/instagram` to the valid OAuth redirect URIs.
3. Request the scopes used by Genfeed:
   `business_management`, `instagram_basic`, `pages_show_list`,
   `pages_read_engagement`, `instagram_content_publish`,
   `instagram_manage_insights`, `pages_manage_posts`, `public_profile`, and
   `ads_management`.
4. Add operator/test accounts while the Meta app is in development mode. Live
   use requires the applicable permissions to pass Meta App Review.
5. Set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
   `INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_API_VERSION`, and
   `INSTAGRAM_GRAPH_URL=https://graph.facebook.com`.

### Facebook and Meta Ads

1. In the Meta app, configure Facebook Login and add the Marketing API when
   Meta Ads is in scope.
2. Add `{APP_ORIGIN}/oauth/facebook` to the valid OAuth redirect URIs.
3. Request the scopes used by Genfeed: `ads_management`, `ads_read`,
   `public_profile`, `email`, `pages_show_list`, `pages_manage_posts`,
   `pages_read_engagement`, `pages_manage_metadata`, and `publish_video`.
4. Complete business verification and App Review for permissions that require
   them before enabling the connection for non-test users.
5. Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`,
   `FACEBOOK_API_VERSION`, and
   `FACEBOOK_GRAPH_URL=https://graph.facebook.com`.

### LinkedIn

1. Create an app in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps).
2. Add `{APP_ORIGIN}/oauth/linkedin` on the Auth tab.
3. Add the **Sign In with LinkedIn using OpenID Connect** and
   **Share on LinkedIn** products. Genfeed requests `openid`, `profile`,
   `email`, and `w_member_social`.
4. Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and
   `LINKEDIN_REDIRECT_URI`.

References: [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
and [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin).

### Threads

1. Create or open a Meta app and add the Threads API use case.
2. Register `{APP_ORIGIN}/oauth/threads` exactly.
3. Request `threads_basic`, `threads_content_publish`,
   `threads_manage_insights`, `threads_manage_replies`, and
   `threads_read_replies`.
4. Add the test account while the app is in development mode and complete the
   required Threads review before production use.
5. Set `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET`, `THREADS_REDIRECT_URI`,
   `THREADS_API_VERSION`, and `THREADS_GRAPH_URL=https://graph.threads.net`.

Reference: [Threads API getting started](https://developers.facebook.com/docs/threads/get-started).

### YouTube

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   and enable YouTube Data API v3 and YouTube Analytics API.
2. Configure the OAuth consent screen, then create a Web application OAuth
   client with `{APP_ORIGIN}/oauth/youtube` as an authorized redirect URI.
3. Genfeed requests YouTube read, upload, force-SSL, and analytics-read scopes.
   Add test users while the consent screen is in Testing and complete Google
   OAuth verification before production use of sensitive scopes.
4. Set the shared `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`, plus `YOUTUBE_REDIRECT_URI`.
   `YOUTUBE_API_KEY` is optional for public reads. If the same client also
   powers Google sign-in, Google Ads, or Search Console, register all enabled
   callbacks on that client.

Reference: [YouTube authorization credentials](https://developers.google.com/youtube/registering_an_application).

### TikTok

1. Create an app in [TikTok for Developers](https://developers.tiktok.com/)
   with Login Kit and Content Posting API.
2. Register `{APP_ORIGIN}/oauth/tiktok`. This value is derived from
   `GENFEEDAI_APP_URL`, so the provider registration and app origin must agree.
3. Request `user.info.basic`, `user.info.stats`, `user.info.profile`,
   `video.list`, `video.upload`, and `video.publish`.
4. Complete the scope audit before production users authorize the app.
5. Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.

References: [TikTok scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes)
and [Direct Post setup](https://developers.tiktok.com/docs/en/content-posting-api-get-started).

### Restream

1. Create an app in [Restream Applications](https://developers.restream.io/apps).
2. Register `{APP_ORIGIN}/oauth/restream`.
3. Enable the `profile.read` and `chat.read` scopes.
4. Set `RESTREAM_CLIENT_ID`, `RESTREAM_CLIENT_SECRET`, and
   `RESTREAM_REDIRECT_URI`.

Reference: [Restream authentication](https://developers.restream.io/authentication/authorize-dialog).

### Fanvue

1. Use a KYC-complete creator account to create an OAuth app in the Fanvue
   Builder area. Save the client secret immediately; Fanvue displays it once.
2. Register `{APP_ORIGIN}/oauth/fanvue` and enable PKCE.
3. Configure the scopes requested by Genfeed: `openid`, `offline_access`,
   `offline`, `read:self`, `read:media`, `write:media`, and `write:post`.
4. Set `FANVUE_CLIENT_ID`, `FANVUE_CLIENT_SECRET`, and
   `FANVUE_REDIRECT_URI`.

References: [Fanvue OAuth implementation](https://api.fanvue.com/docs/authentication/implementation-guide)
and [testing an app](https://api.fanvue.com/docs/introduction/testing-your-app).

### Google Ads and YouTube Ads

1. Create a Web application OAuth client in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   enable Google Ads API, and register `{APP_ORIGIN}/oauth/google-ads`.
2. Configure the OAuth consent screen for the restricted
   `https://www.googleapis.com/auth/adwords` scope and complete verification
   before production use.
3. Obtain a developer token from the
   [Google Ads API Center](https://ads.google.com/aw/apicenter). OAuth client
   credentials alone are not enough to call Google Ads API.
4. Set the shared `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`, plus `GOOGLE_ADS_REDIRECT_URI` and
   `GOOGLE_ADS_DEVELOPER_TOKEN`. Do not create connector-specific Google OAuth
   aliases; the shared client is the canonical credential.

Reference: [Google Ads OAuth](https://developers.google.com/google-ads/api/docs/oauth/overview).

## Reddit: deferred provider

Reddit has an OAuth route but is deliberately absent from the Connect catalog
until approved Data API access exists. Do not expose the tile merely because
credentials are present.

1. Obtain Reddit approval for the intended commercial, per-user publishing use
   case before treating app registration as sufficient.
2. Create a web app in [Reddit app preferences](https://www.reddit.com/prefs/apps)
   and register `{APP_ORIGIN}/oauth/reddit`.
3. Genfeed requests `identity` and `submit` with permanent access.
4. Set `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REDIRECT_URI`, and
   an identifying `REDDIT_USER_AGENT`.

Reference: [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms).

## Smoke-test contract

Run this once for each configured provider and environment:

1. Confirm the provider app has the exact callback and required products or
   scopes configured.
2. Confirm the deployment has every required environment key without printing
   its value. Sync and restart or roll the API after a change.
3. From a brand's Connect menu, select the provider. The browser must reach the
   provider consent screen with the intended app identity.
4. Approve with an eligible test or production account. The provider must
   return to `/oauth/{provider}` with `code` and `state`, and Genfeed must mark
   the brand credential connected.
5. Run one provider-specific proof:
   - Social/video publishing: publish a clearly identified test item and remove
     it afterward when the provider supports deletion.
   - Meta Ads: list accessible ad accounts through the Facebook credential.
   - Google Ads and YouTube Ads: list accessible customers with the developer
     token; do not create or spend against a campaign for this smoke test.
   - Restream: load the connected profile and open the authorized chat path.
   - Fanvue: load the connected creator profile before attempting a test post.
6. Record only the provider, environment, UTC timestamp, release SHA, account
   class, granted-scope result, and observable outcome. Never record app IDs,
   authorization codes, tokens, or secrets.

## Failure guide

- Immediate Genfeed `503`: a required setting is absent, blank, or a known
  placeholder. Fix the deployment configuration before retrying.
- Provider rejects the callback: compare the registered and generated redirect
  URI byte-for-byte.
- Consent is unavailable: confirm the operator is a provider-app tester or the
  app and scopes have passed the provider's production review.
- Verify fails after consent: start a new connection. Authorization codes are
  single-use; also confirm the same redirect URI was used for authorization
  and token exchange.
- OAuth succeeds but the proof call fails: compare the granted scopes with the
  current controller scope list and the provider product/access tier.
