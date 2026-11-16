/**
 * Identifiers for the in-flight release mutations. The page keys its pending
 * state on them and the drawer reads the same values to show a spinner on the
 * control that started the mutation and to lock the rest.
 */
export const RELEASE_RESCHEDULE_ACTION = 'release:reschedule';
export const RELEASE_RESUME_ACTION = 'release:resume';

export function targetRescheduleAction(targetId: string): string {
  return `target:reschedule:${targetId}`;
}

export function targetManualPostAction(targetId: string): string {
  return `target:manual-post:${targetId}`;
}

export function targetRetryAction(targetId: string): string {
  return `target:retry:${targetId}`;
}
