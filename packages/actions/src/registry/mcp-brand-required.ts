import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';

/**
 * MCP generation tools that always run under one explicit brand (#5786).
 * Agent threads carry a validated brand scope, so only the MCP view of these
 * tools makes `brandId` required; the canonical definitions stay shared.
 */
export const MCP_BRAND_REQUIRED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'enhance_prompt',
  'generate',
  'generate_content',
  'generate_turbo_content',
  'transform_media',
]);

export const MCP_BRAND_ID_DESCRIPTION =
  'Brand that owns this generation. Required on MCP: call get_brands and pass one of its ids. A call without it is rejected with the list of your brands.';

export const MCP_BRAND_REQUIRED_NOTE =
  'brandId is required: call get_brands first and pass the brand id.';

export function isMcpBrandRequiredTool(name: string): boolean {
  return MCP_BRAND_REQUIRED_TOOL_NAMES.has(name);
}

/** The trimmed `brandId` argument, or undefined when absent or blank. */
export function readMcpBrandId(
  args: Record<string, unknown> | undefined,
): string | undefined {
  const value = args?.brandId;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function withRequiredMcpBrandId(
  parameters: ToolParameterSchema,
): ToolParameterSchema {
  const existing = parameters.properties.brandId;
  const base =
    existing !== null &&
    typeof existing === 'object' &&
    !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : { type: 'string' };
  return {
    ...parameters,
    properties: {
      ...parameters.properties,
      brandId: { ...base, description: MCP_BRAND_ID_DESCRIPTION },
    },
    required: [...new Set([...(parameters.required ?? []), 'brandId'])],
  };
}

export interface McpBrandOption {
  id: string;
  label: string;
}

/** Message that names the caller's brands so the client can retry. */
export function describeMissingMcpBrand(
  toolName: string,
  brands: readonly McpBrandOption[],
): string {
  const listing =
    brands.length > 0
      ? `Your brands: ${brands.map((brand) => `${brand.label} (${brand.id})`).join('; ')}.`
      : 'You have no brands yet. Create one in the Genfeed app (Settings > Brands) or ask an organization admin to; admins can also use onboard_brand.';
  return `${toolName} requires brandId. Pass the id of the brand this generation is for. ${listing}`;
}
