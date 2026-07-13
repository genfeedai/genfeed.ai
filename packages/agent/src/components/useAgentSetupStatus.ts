'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { CredentialPlatform } from '@genfeedai/enums';
import { computeBrandCompleteness } from '@genfeedai/helpers';
import type { ICredential } from '@genfeedai/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { useMemo } from 'react';

/**
 * A single connected social account, projected from a brand-scoped credential.
 * Mirrors the `socialConnections` shape produced by
 * `packages/hooks/pages/use-brand-detail/use-brand-detail.ts`, trimmed to what
 * the agent setup panel renders.
 */
export interface AgentSetupConnection {
  avatarUrl?: string;
  credentialId: string;
  handle?: string;
  label?: string;
  name?: string;
  platform: CredentialPlatform;
}

export interface AgentSetupStatus {
  /** Active brand used for completeness scoring (undefined when none is selected). */
  brand: Brand | undefined;
  /** Overall brand-completeness score (0-100), or null when there is no brand. */
  completenessScore: number | null;
  /** Connected accounts for the active brand. */
  connectedConnections: AgentSetupConnection[];
  /** Number of connected social channels. */
  connectedPlatformsCount: number;
  /** True once at least one social channel is connected. */
  hasConnectedChannels: boolean;
  /** True once brand context is fully filled in (score === 100). */
  isBrandComplete: boolean;
  /** True once both brand context and channels are complete. */
  isSetupComplete: boolean;
  /**
   * Whether the setup-progress panel should be offered. Requires a selected
   * brand and at least one incomplete setup dimension.
   */
  showSetupPanel: boolean;
}

/**
 * Derives agent-workspace onboarding/setup status from the active brand.
 *
 * Reuses the same signals the brand surfaces already rely on:
 * - `computeBrandCompleteness` (0-100 score, same helper behind `BrandCompletenessCard`)
 * - brand-scoped `credentials` from the brand context
 *
 * The panel is considered complete — and hides permanently — only when the
 * brand is 100% complete AND at least one channel is connected.
 */
export function useAgentSetupStatus(): AgentSetupStatus {
  const { selectedBrand, credentials } = useBrand();

  const completenessScore = useMemo(
    () =>
      selectedBrand
        ? computeBrandCompleteness(selectedBrand).overallScore
        : null,
    [selectedBrand],
  );

  const connectedConnections = useMemo<AgentSetupConnection[]>(
    () =>
      credentials
        .filter((credential: ICredential) => credential.isConnected === true)
        .map((credential: ICredential) => ({
          avatarUrl: credential.externalAvatar,
          credentialId: credential.id,
          handle: credential.externalHandle,
          label: credential.label,
          name: credential.externalName,
          platform: credential.platform,
        })),
    [credentials],
  );

  const connectedPlatformsCount = connectedConnections.length;
  const hasConnectedChannels = connectedPlatformsCount > 0;
  const isBrandComplete = completenessScore === 100;
  const isSetupComplete = isBrandComplete && hasConnectedChannels;
  const showSetupPanel = Boolean(selectedBrand) && !isSetupComplete;

  return {
    brand: selectedBrand,
    completenessScore,
    connectedConnections,
    connectedPlatformsCount,
    hasConnectedChannels,
    isBrandComplete,
    isSetupComplete,
    showSetupPanel,
  };
}
