import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';

export interface UseFastlaneEnabledReturn {
  /** Whether Fastlane is enabled for the current organization. Defaults to false. */
  isEnabled: boolean;
  /** Whether the organization settings are still loading. */
  isLoading: boolean;
}

/**
 * Reads the org-level `isFastlaneEnabled` flag. Default OFF.
 *
 * Consumers must respect `isLoading` to avoid nav flicker / rendering gated
 * content before the flag resolves.
 */
export function useFastlaneEnabled(): UseFastlaneEnabledReturn {
  const { settings, isLoading } = useOrganization();

  return {
    isEnabled: settings?.isFastlaneEnabled ?? false,
    isLoading,
  };
}
