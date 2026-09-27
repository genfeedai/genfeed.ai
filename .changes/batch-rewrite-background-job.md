packages: @genfeedai/contracts, @genfeedai/props, @genfeedai/services

Review batch rewrite runs as a background BullMQ job (#5365). Add
BATCH_REWRITE_QUEUE, BatchRewriteJobData / BatchRewriteJobResult,
BatchRewriteJobStatus, BatchRewriteItemFailureReason, IBatchRewriteJob and
CreditsConfig.isReservationDeferred. BatchesService gains createRewriteJob,
getActiveRewriteJob, getRewriteJob and cancelRewriteJob; the `rewrite` item
action is removed. Review grid and queue props add rewriteProgress and
isRewriteStarting, typed by ReviewRewriteProgressProps.
