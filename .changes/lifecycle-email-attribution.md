packages: actions config contracts serializers services

Add the lifecycle email system and its admin outcome attribution.

- `actions`: new `./src/registry/contracts/email-product-signals-action-contracts`
  registering the product-signal sweep actions (generation results, purchase
  receipts, conversion attribution).
- `contracts`: `PRODUCT_EMAIL_TOPICS` and the `NotificationTopic` union gain
  `content.digest`. The brand performance digest previously queued under
  `content.weekly`, so disabling the automated weekly recap silently dropped an
  explicitly requested report. A stored preference row for `content.weekly` no
  longer affects the digest; `content.digest` defaults to enabled.
- `config`: `env-config.interface` gains the provider webhook secret used to
  verify signed email receipts.
- `serializers`: new `email-performance` attributes, config and server
  serializer triplet for the admin report. Existing admin serializers are
  unchanged; the `admin` barrels re-export the additions.
- `services`: `admin/system-emails.service` exposes the report query, and
  `organization/users.service` exposes product email preferences. Both are
  additive.

No consumer must change to keep compiling. A consumer that enumerates
`PRODUCT_EMAIL_PREFERENCES` will render one additional topic.
