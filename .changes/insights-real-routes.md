packages: @genfeedai/services @genfeedai/hooks @genfeedai/props @genfeedai/ui

Remove `PredictiveAnalyticsService`: none of its routes existed on the API, so
the Insights page always showed "unavailable" (#5290). `useInsights` now
exposes the real `GET /insights` list with read and dismiss actions, the
insights props drop the unbacked card types and add `InsightListCardProps`,
and the unbacked insight cards are removed from `@genfeedai/ui`.
