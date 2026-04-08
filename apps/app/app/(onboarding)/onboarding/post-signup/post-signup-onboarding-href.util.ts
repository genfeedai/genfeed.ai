interface OrganizationRouteCandidate {
  isActive: boolean;
  slug: string;
}

interface ResolvePostSignupOnboardingHrefInput {
  isSelfHosted: boolean;
  organizations?: OrganizationRouteCandidate[];
  prompt?: string;
}

export function resolvePostSignupOnboardingHref(
  input: ResolvePostSignupOnboardingHrefInput,
): string | null {
  const promptSuffix = input.prompt
    ? `?prompt=${encodeURIComponent(input.prompt)}`
    : '';
  const fallbackHref = `/chat/onboarding${promptSuffix}`;

  if (input.isSelfHosted) {
    return fallbackHref;
  }

  const activeOrganization =
    input.organizations?.find((organization) => organization.isActive) ??
    input.organizations?.[0];

  if (!activeOrganization?.slug) {
    return null;
  }

  return `/${activeOrganization.slug}/~/chat/onboarding${promptSuffix}`;
}
