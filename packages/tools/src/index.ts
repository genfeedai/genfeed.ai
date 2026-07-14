export type { AgentToolOutput } from './adapters/to-agent-tool.js';
export { toAgentTools } from './adapters/to-agent-tool.js';
export type { McpToolOutput } from './adapters/to-mcp-tool.js';
export { toMcpTools } from './adapters/to-mcp-tool.js';
export type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolParameterSchema,
  ToolRequiredRole,
  ToolSurfaceConfig,
} from './interfaces/tool-definition.interface.js';
export type {
  CuratedActionCatalogEntry,
  CuratedActionName,
  CuratedActionSurface,
} from './registry/curated-action-catalog.js';
export {
  CURATED_ACTION_CATALOG,
  isActionOnSurface,
} from './registry/curated-action-catalog.js';
export {
  ALL_TOOLS,
  getToolByName,
  getToolsByCategory,
  getToolsForRole,
  getToolsForSurface,
} from './registry/tool-registry.js';
