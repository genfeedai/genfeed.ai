import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * Persist / read the per-brand dashboard page layout produced with
 * `render_dashboard`. Layouts are stored snapshot-free: every data-bearing
 * block (metric_card, kpi_grid, chart, table, top_posts) MUST carry a
 * `sourceKey` referencing a live analytics source; embedded values are stripped
 * on save and re-hydrated at render time so persisted layouts never go stale.
 */
export const AGENT_DASHBOARD_LAYOUT_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Persist the current dashboard as the saved layout for a brand page (default: the workspace overview). Pass the same blocks you would send to render_dashboard, but every data-bearing block (metric_card, kpi_grid card, chart, table, top_posts) MUST include a sourceKey referencing a live analytics source (e.g. "totalPosts", "timeSeries", "brandLeaderboard", "topPosts") — embedded data is stripped and re-hydrated at render time. Invalid layouts are rejected with validation issues.',
    name: 'save_dashboard_layout',
    parameters: {
      properties: {
        blocks: {
          description:
            'Dashboard blocks to persist (same shape as render_dashboard). Data-bearing blocks must include a sourceKey.',
          items: { type: 'object' },
          type: 'array',
        },
        document: {
          description:
            'Alternative to blocks: a full genfeed.dashboard.openui.v1 document to persist.',
          type: 'object',
        },
        pageKey: {
          description:
            'Page this layout applies to. Defaults to "workspace-overview".',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Read the saved dashboard layout for a brand page (default: the workspace overview). Returns the persisted, snapshot-free OpenUI document, or null when no layout has been saved.',
    name: 'get_dashboard_layout',
    parameters: {
      properties: {
        pageKey: {
          description:
            'Page to read the layout for. Defaults to "workspace-overview".',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
