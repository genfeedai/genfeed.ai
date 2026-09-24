packages: @genfeedai/contracts @genfeedai/integrations

Public ad discovery accepts an optional `mediaType` (`visual`, `image`, `video`),
defaulting to visual creatives. Samples add optional `mediaType` and
`adPerformanceId`; the latter is provided only after a selected brand's sources
are saved atomically. Searches without a brand remain preview-only.

`@genfeedai/integrations/ads` exports `publicAdYouTubeEmbedUrl`, which returns a
privacy-enhanced embed URL for recognized YouTube video links, or undefined.
Google archive normalization now separates recognized video links from image
URLs. Consumers should render `videoUrls` with a player or YouTube embed instead
of assuming every archive media URL is an image. Existing function signatures
remain compatible; no database migration or environment-key change is needed.
