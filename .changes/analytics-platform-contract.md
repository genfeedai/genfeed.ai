packages: @genfeedai/contracts @genfeedai/serializers @genfeedai/services

`IPlatformComparison` is now the one contract for `GET /analytics/platforms` and
`GET /organizations/:id/analytics/platforms`. It gains `totalEngagement` (likes + comments +
shares + saves); `platform` is the domain id and `postCount` counts distinct posts.
`analyticsPlatformAttributes` whitelists `totalEngagement`. `AnalyticsService.getPlatformComparison`
and `OrganizationsService.findOrganizationAnalyticsPlatforms` return `IPlatformComparison[]`.

`GET /analytics/platforms` no longer returns `totalViews` / `totalPosts` / `avgEngagementRate`
or the `*Percentage` fields; the serializer had always dropped them.

See genfeedai/genfeed.ai#5419.
