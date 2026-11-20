import type {
  CanonicalToolDefinition,
  ToolAnnotations,
  ToolCreditPricing,
  ToolDataSource,
  ToolMutationPolicy,
  ToolRequiredRole,
} from '../../interfaces/tool-definition.interface';

const ROLE_RANK = { admin: 1, superadmin: 2, user: 0 } as const;

export interface McpCatalogPolicy {
  annotations: ToolAnnotations;
  creditCost: number;
  creditPricing: ToolCreditPricing;
  dataSource: ToolDataSource;
  mutationPolicy: ToolMutationPolicy | undefined;
  requiredRole: ToolRequiredRole;
}

function pricingBounds(pricing: ToolCreditPricing): {
  maximum: number;
  minimum: number;
} {
  if (pricing.mode === 'fixed') {
    return { maximum: pricing.amount, minimum: pricing.amount };
  }
  if (pricing.mode === 'variable') {
    return { maximum: pricing.maximum, minimum: pricing.minimum };
  }
  return { maximum: 0, minimum: 0 };
}

function deriveCreditPricing(
  targets: readonly CanonicalToolDefinition[],
): ToolCreditPricing {
  const pricings = targets.map(
    (tool) => tool.creditPricing ?? { amount: tool.creditCost, mode: 'fixed' },
  ) as ToolCreditPricing[];
  const [first] = pricings;
  if (
    first?.mode === 'fixed' &&
    pricings.every(
      (pricing) => pricing.mode === 'fixed' && pricing.amount === first.amount,
    )
  ) {
    return first;
  }
  // Each action is priced by the tool it runs; a quote is asked per action.
  if (pricings.some((pricing) => pricing.mode === 'quote')) {
    return { mode: 'quote', quoteTool: 'find_tools' };
  }
  const bounds = pricings.map(pricingBounds);
  return {
    maximum: Math.max(...bounds.map((bound) => bound.maximum)),
    minimum: Math.min(...bounds.map((bound) => bound.minimum)),
    mode: 'variable',
    unit: 'call',
  };
}

function deriveDataSource(
  targets: readonly CanonicalToolDefinition[],
): ToolDataSource {
  const sources = targets.map((tool) => tool.dataSource ?? 'stored');
  if (sources.includes('provider-paid')) return 'provider-paid';
  return sources.includes('provider') ? 'provider' : 'stored';
}

function deriveMutationPolicy(
  targets: readonly CanonicalToolDefinition[],
): ToolMutationPolicy | undefined {
  const policies = targets.map((tool) => tool.mutationPolicy);
  if (policies.includes('approval-required')) return 'approval-required';
  return policies.includes('direct') ? 'direct' : undefined;
}

/**
 * What a merged tool declares, taken from the tools it runs: the most
 * restrictive annotations (read-only only when every action is), the widest
 * pricing and policy, and the lowest role that can reach any action. Each
 * call is still gated by the tool its action runs.
 */
export function deriveMcpCatalogPolicy(
  targets: readonly CanonicalToolDefinition[],
): McpCatalogPolicy {
  const annotated = targets.map((tool) => tool.annotations);
  const everyAnnotation = (key: keyof ToolAnnotations): boolean =>
    annotated.every((annotations) => annotations?.[key] === true);
  const someAnnotation = (key: keyof ToolAnnotations): boolean =>
    annotated.some((annotations) => annotations?.[key] === true);

  return {
    annotations: {
      destructiveHint: someAnnotation('destructiveHint'),
      idempotentHint: everyAnnotation('idempotentHint'),
      openWorldHint: someAnnotation('openWorldHint'),
      readOnlyHint: everyAnnotation('readOnlyHint'),
    },
    creditCost: Math.min(...targets.map((tool) => tool.creditCost)),
    creditPricing: deriveCreditPricing(targets),
    dataSource: deriveDataSource(targets),
    mutationPolicy: deriveMutationPolicy(targets),
    requiredRole: targets
      .map((tool) => tool.requiredRole)
      .reduce((least, role) =>
        ROLE_RANK[role] < ROLE_RANK[least] ? role : least,
      ),
  };
}
