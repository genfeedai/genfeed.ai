/** Agent-first onboarding, org or brand scoped, including its thread child. */
export function isAgentOnboardingPathname(
  pathname: string | null | undefined,
): boolean {
  return Boolean(pathname?.includes('/agent/onboarding'));
}
