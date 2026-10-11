import { describe, it } from 'vitest';

/**
 * Connected acceptance (#6526), media formats. Lane K is building image, carousel, video and
 * short generation for breakout responses; enable these when its PR merges, using the same
 * journey fixtures (`detectBreakout`, `runQueuedBreakoutExecution`, `approveInReviewQueue`,
 * `buildDeliveryHarness`) with a fake image/video provider beside the fake text provider.
 */
describe('breakout acceptance: media formats (enable when lane K merges)', () => {
  it.todo(
    'generates, quality-gates and holds an image follow-up for review, then publishes it as the scheduling member',
  );
  it.todo(
    'generates a carousel follow-up whose ordered ingredients survive the review pin and the dispatch fence',
  );
  it.todo(
    'generates a video follow-up and holds it behind the media readiness gate until its asset is ready',
  );
  it.todo(
    'generates a short follow-up for a short-form source and keeps the source format',
  );
  it.todo(
    'counts a media output and the X quote inside the same five-output ceiling and budgets',
  );
  it.todo(
    'treats an ambiguous media provider attempt like a text one: siblings blocked until reconciled, no second paid request',
  );
});
