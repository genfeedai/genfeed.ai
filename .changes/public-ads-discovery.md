packages: @genfeedai/contracts @genfeedai/integrations @genfeedai/serializers @genfeedai/services

Public competitor ads discovery adds an authenticated search API without
requiring a connected advertising account.

- Contracts add `AdsDiscoveryQuery`, `AdsDiscoveryResponse`, advertiser and
  sample shapes, plus optional `externalAdvertiserId` on watch creation.
- Integrations export the public Meta, Google Ads Transparency and TikTok Ads
  Library normalizers, Google advertiser-query validation, and TikTok coverage
  countries. Normalized creatives gain optional archive, image and video URLs.
  Unknown Meta activity and reach remain absent instead of becoming false or
  zero.
- TikTok platform resolution now returns `tiktok_ads_library`. Consumers with
  exhaustive provider switches must handle that value. Historical
  `tiktok_creative_center` records and their normalizer remain supported; both
  sources remain tenant-owned research. No stored-record rewrite is required.
- Serializers export the ads discovery attributes, configuration and server
  serializer. Services add `AdsResearchService.discover(query, signal?)`, which
  returns the typed resource extracted from the JSON:API response. Callers must
  handle pending, ready, empty, unavailable and unsupported states; poll only a
  submitted pending search, with a bounded deadline.
- Google discovery accepts a website/domain or AR advertiser ID, not generic
  keywords. TikTok coverage is limited to the EEA, UK and Switzerland. Returned
  creative counts describe a sample rather than an advertiser's full inventory.

Existing owned-account APIs are unchanged. Public discovery does not create
watched advertisers or performance records automatically.
