import type { OrganizationOption } from '@genfeedai/contracts/interfaces';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';

export interface McpResultScope {
  /** The brand the call named, when it named one and the brand exists. */
  brand?: { id: string; label: string };
  organization: Pick<OrganizationOption, 'id' | 'label' | 'slug'>;
}

/** The `brandId` a call names, at the top level or inside its `input`. */
export function readNamedBrandId(
  args: Record<string, unknown>,
): string | undefined {
  const { brandId, input } = args;
  if (typeof brandId === 'string' && brandId) return brandId;
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const nested = (input as Record<string, unknown>).brandId;
    if (typeof nested === 'string' && nested) return nested;
  }
  return undefined;
}

/** The structured result with each card marked with the organization it was created in, so the card polls its job from there. */
function withCardOrganization(
  structured: Record<string, unknown> | undefined,
  organizationId: string,
): Record<string, unknown> {
  const view = structured?.genfeedCards as { cards?: unknown } | undefined;
  if (!Array.isArray(view?.cards)) return structured ?? {};
  return {
    ...structured,
    genfeedCards: {
      ...view,
      cards: view.cards.map((card: object) => ({
        ...card,
        organization: organizationId,
      })),
    },
  };
}

/**
 * Names the organization and brand a call acted in, in the text a person reads
 * and in the structured result, so a draft, a scheduled post or a pending
 * approval cannot be mistaken for another organization's.
 */
export function withResultScope<T extends McpAppResult>(
  result: T,
  scope: McpResultScope,
): T {
  const text = scope.brand
    ? `Organization: ${scope.organization.label}. Brand: ${scope.brand.label}.`
    : `Organization: ${scope.organization.label}.`;
  return {
    ...result,
    content: [...result.content, { text, type: 'text' as const }],
    structuredContent: {
      ...withCardOrganization(result.structuredContent, scope.organization.id),
      ...(scope.brand ? { brand: scope.brand } : {}),
      organization: scope.organization,
    },
  };
}
