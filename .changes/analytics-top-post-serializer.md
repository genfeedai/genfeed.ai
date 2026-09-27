packages: @genfeedai/serializers

Add `analyticsTopPostAttributes`, `analyticsTopPostSerializerConfig` and
`AnalyticsTopPostSerializer` for `GET /analytics/top`, which previously reused
`AnalyticsTopContentSerializer` (built for a different endpoint) and dropped most of its
fields. No existing export changed.

See genfeedai/genfeed.ai#5404.
