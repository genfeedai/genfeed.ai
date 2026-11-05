-- Pin the four publish-critical status columns to their closed sets (#8686).
-- A stray value here drops a target from schedules, retries a provider publish
-- that already landed, or stalls a notification retry, so the database refuses
-- it instead of trusting every writer.
--
-- NOT VALID enforces each check on new writes immediately without scanning the
-- existing rows; 20261105210100_publish_status_checks_validate scans them.
-- Before deploy, the read-only query in the PR must return no rows: a CHECK is
-- evaluated on every UPDATE, so an existing out-of-set row would refuse any
-- later write to it.

-- TargetExecutionState in @genfeedai/contracts.
ALTER TABLE "posts"
  ADD CONSTRAINT "posts_targetExecutionState_check"
  CHECK (
    "targetExecutionState" IN (
      'draft', 'scheduled', 'paused', 'cancelled',
      'publishing', 'published', 'failed', 'skipped'
    )
  ) NOT VALID;

-- ReleaseStatus in @genfeedai/contracts.
ALTER TABLE "post_groups"
  ADD CONSTRAINT "post_groups_status_check"
  CHECK (
    "status" IN (
      'draft', 'scheduled', 'paused', 'cancelled',
      'publishing', 'published', 'failed', 'partially-published'
    )
  ) NOT VALID;

-- PostProviderPublishReceiptStatus in @genfeedai/contracts.
ALTER TABLE "post_provider_publish_receipts"
  ADD CONSTRAINT "post_provider_publish_receipts_status_check"
  CHECK ("status" IN ('attempting', 'accepted', 'uncertain', 'released'))
  NOT VALID;

-- NotificationDeliveryStatus in @genfeedai/contracts.
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_status_check"
  CHECK (
    "status" IN (
      'pending', 'processing', 'retry_pending', 'delivered', 'skipped', 'failed'
    )
  ) NOT VALID;
