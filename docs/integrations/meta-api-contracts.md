# Meta API contracts

Reviewed against Meta documentation and the official Facebook Business SDK 26.0.0 on 2026-10-08.

Facebook Graph and Marketing API calls use the shared `META_GRAPH_API_VERSION` default, currently **v26.0**. Facebook and Instagram retain their deployment configuration overrides (`FACEBOOK_API_VERSION`, `INSTAGRAM_API_VERSION`); both must match the intended release. Instagram uses Facebook Login and `graph.facebook.com` throughout the current integration.

Threads follows its separate **v1.0** release line. Its token exchange and refresh endpoints are **unversioned**. Both supported Threads Graph hosts can be configured consistently for the controller and service.

| Workflow | Current contract |
| --- | --- |
| Facebook OAuth and Page discovery | Versioned OAuth/Graph calls; cursor pagination of `/me/accounts`; resolve the selected Page, never a sibling account. Request Page engagement and insights grants in addition to publishing grants. |
| Facebook text, photo and video publishing | `/feed`, `/photos`, `/videos`. Photo publication retains `post_id` for Page post analytics. Video publication uses `file_url` and the supplied Page token; retains the Video ID. |
| Facebook scheduling, comments and deletion | Versioned Page/owned-resource edges with the existing Page-token flow. |
| Facebook analytics | Page posts request `post_media_view`; videos request `video_insights.metric(total_video_views)` on the Video node. Video views count playback of at least three seconds (or nearly the duration of shorter videos). Store the exact metric source and availability; do not invent reach or impressions. |
| Instagram OAuth, account discovery and readiness | Discover professional accounts through authorized Facebook Pages. The Facebook Login IGUser profile request omits unsupported `account_type`; professional Creator accounts with the publish grant can publish Feed/Reels. |
| Instagram Feed/Reels/carousel publishing and comments | Versioned IGUser/media/container/comment edges; retain container status polling and published media IDs. |
| Instagram media analytics and authorized research | `views`, `reach`, `saved`, `shares`, `total_interactions` for owned Feed/Reels media. Preserve absent metrics as unavailable. Historical snapshots can retain impressions without relabeling them as views. Consumers use the same configured Graph base URL. |
| Instagram conversations and direct messages | Resolve the Page linked to the selected Instagram account, including later pagination batches. Use the Page ID and Page token, a recipient `id`, and the returned `message_id`. Existing connected accounts may need to reconnect for newly required grants. |
| Instagram comment private replies | Separate operation with recipient `comment_id`, Page ID/token, `instagram_manage_comments` and `pages_messaging`. Reply bots carry the original comment ID through the workflow. |
| Threads publishing, replies, moderation and insights | Versioned v1.0 resource edges; OAuth exchange `/oauth/access_token`, long-lived token exchange `/access_token`, and refresh `/refresh_access_token` without a version prefix. |
| Marketing reads | Shared v26.0 Graph base for accounts, campaigns, ad sets, ads, creatives, targeting catalogs, images/videos and insights. Historical campaign objective values remain readable. |
| Marketing campaign/ad-set creation | New campaigns require ODAX `OUTCOME_*` objectives. Ad-set budget campaigns explicitly disable budget sharing. Campaign-budget campaigns omit the ad-set sharing flag. Preparation keeps campaign objectives distinct from optimization goals. |
| Marketing creative/image/video creation | Website creatives explicitly opt out of automatic website-and-shop destinations. Ad images download through the destination guard with type, size and time limits and upload base64 `bytes` in the form body. Videos retain `file_url` uploads. |

## Verification boundaries

Service/controller and downstream workflow regressions assert request URLs, token identity, payloads, response IDs, pagination, permission failures and metric availability. These contract tests do not publish content, send live messages, create spending campaigns or prove that an individual connected account has all required Meta grants. Deployment health checks likewise do not replace authenticated provider acceptance tests.

After changing deployment overrides, restart every service that imports these integrations, including analytics/publishing workers. Existing OAuth grants are not expanded by a server upgrade: reconnect accounts when a missing permission is reported.

## Primary references

- [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/)
- [Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos/)
- [Video insights](https://developers.facebook.com/docs/graph-api/reference/video/video_insights/)
- [Page post insights](https://developers.facebook.com/docs/graph-api/reference/v26.0/insights/)
- [Instagram media insights](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/reference/ig-media/insights/)
- [Instagram private replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/messaging-api/private-replies/)
- [Threads access tokens](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/)
- [Campaign creation](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/)
- [Facebook Business SDK 26.0.0](https://github.com/facebook/facebook-python-business-sdk/tree/26.0.0)
