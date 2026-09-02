import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  type CanonicalToolDefinition,
  getToolsForRole,
  type ToolCategory,
  type ToolRequiredRole,
} from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

type ToolCatalogSurface = 'agent' | 'mcp' | 'cli' | 'all';

const TOOL_CATALOG_SURFACES = ['agent', 'mcp', 'cli'] as const;
const TOOL_CATALOG_CATEGORIES: ToolCategory[] = [
  'ads',
  'admin',
  'agent-control',
  'analytics',
  'campaign',
  'content',
  'generation',
  'identity',
  'onboarding',
  'other',
  'proactive',
  'social',
  'ui',
  'workflow',
];
const TOOL_CATALOG_ROLES: ToolRequiredRole[] = ['user', 'admin', 'superadmin'];

/**
 * Live Genfeed tool catalog listing for operator questions.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentToolCatalogHandler {
  async listGenfeedTools(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const surface = this.readToolCatalogSurface(params.surface);
    const role = this.readToolRequiredRole(params.role);
    const category = this.readToolCategory(params.category);
    const includeParameters = params.includeParameters === true;
    const limit = this.readToolCatalogLimit(params.limit);
    const query = readOptionalString(params.query)?.toLowerCase();

    let tools = this.resolveToolCatalogTools(surface, role);

    if (category) {
      tools = tools.filter((tool) => tool.category === category);
    }

    if (query) {
      tools = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query),
      );
    }

    const total = tools.length;
    const visibleTools = tools.slice(0, limit);

    return {
      creditsUsed: 0,
      data: {
        availableFilters: {
          categories: TOOL_CATALOG_CATEGORIES,
          roles: TOOL_CATALOG_ROLES,
          surfaces: ['agent', 'mcp', 'cli', 'all'],
        },
        category: category ?? null,
        counts: this.buildToolCatalogCounts(role),
        includeParameters,
        query: query ?? null,
        returned: visibleTools.length,
        role,
        surface,
        tools: visibleTools.map((tool) =>
          this.serializeToolCatalogRow(tool, includeParameters),
        ),
        total,
        truncated: total > visibleTools.length,
      },
      success: true,
    };
  }

  private resolveToolCatalogTools(
    surface: ToolCatalogSurface,
    role: ToolRequiredRole,
  ): CanonicalToolDefinition[] {
    if (surface !== 'all') {
      return getToolsForRole(surface, role);
    }

    const toolsByName = new Map<string, CanonicalToolDefinition>();
    for (const itemSurface of TOOL_CATALOG_SURFACES) {
      for (const tool of getToolsForRole(itemSurface, role)) {
        toolsByName.set(tool.name, tool);
      }
    }

    return [...toolsByName.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private buildToolCatalogCounts(role: ToolRequiredRole): {
    byCategory: Record<string, number>;
    bySurface: Record<(typeof TOOL_CATALOG_SURFACES)[number], number>;
    total: number;
  } {
    const allTools = this.resolveToolCatalogTools('all', role);
    return {
      byCategory: Object.fromEntries(
        TOOL_CATALOG_CATEGORIES.map((category) => [
          category,
          allTools.filter((tool) => tool.category === category).length,
        ]),
      ),
      bySurface: {
        agent: getToolsForRole('agent', role).length,
        cli: getToolsForRole('cli', role).length,
        mcp: getToolsForRole('mcp', role).length,
      },
      total: allTools.length,
    };
  }

  private serializeToolCatalogRow(
    tool: CanonicalToolDefinition,
    includeParameters: boolean,
  ): Record<string, unknown> {
    return {
      category: tool.category,
      creditCost: tool.creditCost,
      description: tool.description,
      name: tool.name,
      ...(includeParameters ? { parameters: tool.parameters } : {}),
      requiredRole: tool.requiredRole,
      surfaces: tool.surfaces,
    };
  }

  private readToolCatalogSurface(value: unknown): ToolCatalogSurface {
    return value === 'agent' ||
      value === 'mcp' ||
      value === 'cli' ||
      value === 'all'
      ? value
      : 'all';
  }

  private readToolRequiredRole(value: unknown): ToolRequiredRole {
    return value === 'admin' || value === 'superadmin' || value === 'user'
      ? value
      : 'user';
  }

  private readToolCategory(value: unknown): ToolCategory | undefined {
    return typeof value === 'string' &&
      (TOOL_CATALOG_CATEGORIES as string[]).includes(value)
      ? (value as ToolCategory)
      : undefined;
  }

  private readToolCatalogLimit(value: unknown): number {
    const explicitLimit = readOptionalNumber(value);
    if (explicitLimit === undefined) {
      return 80;
    }

    return Math.max(1, Math.min(200, Math.floor(explicitLimit)));
  }
}
