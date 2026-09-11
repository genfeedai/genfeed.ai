'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getActionDefinition } from '@genfeedai/actions';
import { Platform } from '@genfeedai/contracts';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useCallback, useMemo } from 'react';

const PUBLISHING_PLATFORMS = new Set<string>([
  Platform.TWITTER,
  Platform.LINKEDIN,
]);

export interface WorkflowScopedAccount {
  id: string;
  label: string;
  platform: string;
}

export interface WorkflowScopedBrand {
  id: string;
  label: string;
}

export interface WorkflowActionScope {
  brandId: string;
  brandLabel: string;
  brands: WorkflowScopedBrand[];
  credentials: WorkflowScopedAccount[];
  strategies: Array<{ id: string; label: string }>;
  timezone: string;
}

function actionSchemaProperties(actionId: string): Record<string, unknown> {
  const action = getActionDefinition(actionId);
  const schema = action?.inputSchema;
  if (!schema || typeof schema !== 'object' || !('properties' in schema)) {
    return {};
  }
  const properties = (schema as { properties?: unknown }).properties;
  return properties !== null &&
    typeof properties === 'object' &&
    !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : {};
}

export function useWorkflowActionScope(): WorkflowActionScope {
  const { brandId, brands, credentials, selectedBrand } = useBrand();
  const { strategies } = useAgentStrategies({
    brandId: brandId || undefined,
    enabled: Boolean(brandId),
    isActive: true,
  });

  const connectedAccounts = useMemo((): WorkflowScopedAccount[] => {
    return credentials
      .filter(
        (credential) =>
          credential.isConnected &&
          PUBLISHING_PLATFORMS.has(String(credential.platform)),
      )
      .map((credential) => ({
        id: credential.id,
        label:
          credential.externalHandle ||
          credential.externalName ||
          credential.label ||
          String(credential.platform),
        platform: String(credential.platform),
      }));
  }, [credentials]);

  return {
    brandId,
    brandLabel: selectedBrand?.label || 'Current brand',
    brands: (brands ?? [])
      .filter((brand) => Boolean(brand.id))
      .map((brand) => ({
        id: brand.id,
        label: brand.label || brand.id,
      })),
    credentials: connectedAccounts,
    strategies: strategies.map((strategy) => ({
      id: strategy.id,
      label: strategy.label,
    })),
    timezone: selectedBrand?.agentConfig?.schedule?.timezone || 'UTC',
  };
}

export function useWorkflowActionDefaults(): (
  actionId: string,
) => Record<string, unknown> {
  const scope = useWorkflowActionScope();

  return useCallback(
    (actionId: string) => {
      const properties = actionSchemaProperties(actionId);
      const defaults: Record<string, unknown> = {};
      if (properties.brandId && scope.brandId) {
        defaults.brandId = scope.brandId;
      }
      if (properties.timezone) {
        defaults.timezone = scope.timezone;
      }
      if (properties.credentialIds && scope.credentials.length > 0) {
        defaults.credentialIds = scope.credentials.map(
          (credential) => credential.id,
        );
      }
      return defaults;
    },
    [scope],
  );
}
