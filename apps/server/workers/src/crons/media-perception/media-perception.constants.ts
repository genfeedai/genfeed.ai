/** Every two minutes: perception should follow generation closely. */
export const MEDIA_PERCEPTION_SWEEP_SCHEDULE = '*/2 * * * *';

/** Upper bound of assets and retries queued per sweep. */
export const MEDIA_PERCEPTION_SWEEP_BATCH_SIZE = 50;
