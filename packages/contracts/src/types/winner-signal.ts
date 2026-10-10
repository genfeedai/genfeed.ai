/**
 * #5502 the measured signals a post can win on. Each is compared against the
 * account × platform × content-type baseline for that same signal.
 */
export type WinnerSignal = 'views' | 'engagementRate' | 'likes' | 'comments';
