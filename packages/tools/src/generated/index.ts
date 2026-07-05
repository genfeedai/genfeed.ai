import type {
  GeneratedRoute,
  GeneratedRouteManifest,
} from '../interfaces/generated-route.interface.js';
import {
  GENERATED_MCP_TOOLS,
  GENERATED_TOOL_ROUTES,
} from './openapi-tools.generated.js';

export { GENERATED_MCP_TOOLS, GENERATED_TOOL_ROUTES };
export type { GeneratedRoute, GeneratedRouteManifest };

/** True when `name` is an OpenAPI-generated MCP tool (vs a hand-curated one). */
export function isGeneratedApiTool(name: string): boolean {
  return Object.hasOwn(GENERATED_TOOL_ROUTES, name);
}

/** Route-binding metadata for a generated tool, or `undefined` if not generated. */
export function getGeneratedRoute(name: string): GeneratedRoute | undefined {
  return GENERATED_TOOL_ROUTES[name];
}

/**
 * True when `name` is a generated tool backed by a mutating HTTP verb
 * (POST/PATCH/PUT/DELETE). The MCP dispatcher routes these through the approval
 * gate by verb, so no per-tool enumeration is needed.
 */
export function isGeneratedWriteTool(name: string): boolean {
  return GENERATED_TOOL_ROUTES[name]?.isWrite === true;
}
