import type { IAccountNewsletterSubscribeResponse } from '@genfeedai/contracts/interfaces';

export type FollowCreatorOutcome =
  | IAccountNewsletterSubscribeResponse['status']
  | 'timed-out'
  | 'unavailable';

interface FollowCreatorClient {
  subscribe(request: {
    handle: string;
    source: 'profile';
  }): Promise<IAccountNewsletterSubscribeResponse>;
}

/**
 * Applies the Subscribe a signed-out reader pressed on a creator's profile
 * (`?follow=<handle>` through sign-up) once their account exists. The
 * subscription is best effort: a creator that is gone, a list that is full or
 * a slow answer never holds up onboarding, so it settles within `timeoutMs`.
 */
export async function followCreatorAfterSignup(
  client: FollowCreatorClient,
  handle: string,
  timeoutMs: number,
): Promise<FollowCreatorOutcome> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timed-out'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timed-out'), timeoutMs);
  });
  const attempt = client
    .subscribe({ handle, source: 'profile' })
    .then((result) => result.status)
    .catch(() => 'unavailable' as const);
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
