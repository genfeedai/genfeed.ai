import type { FirstDraftsScheduleResume } from '@genfeedai/props/onboarding/first-drafts.props';

const HANDLE_PATTERN = /^@([A-Za-z0-9_]{1,15})$/;

/** A bare `@handle` is an X profile; anything else is passed through for the API to normalize. */
export function toOnboardingLink(input: string): string {
  const value = input.trim();
  const handle = HANDLE_PATTERN.exec(value);
  return handle ? `https://x.com/${handle[1]}` : value;
}

const RESUME_KEY = 'genfeed.onboarding.firstDrafts.schedule';

/** Keeps the liked drafts across the provider redirect of an account connect. */
export function saveScheduleResume(resume: FirstDraftsScheduleResume): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(resume));
  } catch {
    // Blocked storage: the member re-runs the drafts after connecting.
  }
}

export function readScheduleResume(
  brandId: string,
): FirstDraftsScheduleResume | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const resume = JSON.parse(raw) as FirstDraftsScheduleResume;
    return resume.brandId === brandId ? resume : null;
  } catch {
    return null;
  }
}

export function clearScheduleResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Nothing stored.
  }
}
