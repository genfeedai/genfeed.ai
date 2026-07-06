import type { SourceTool } from '../../interfaces/source-tool.interface.js';

/**
 * Overlap (agent + MCP) batch-generation tools, split out of `overlap.tools.ts`
 * to keep that module under the per-file line budget (`source-tools.test.ts`).
 * Spread into `OVERLAP_TOOLS`, and scanned by the MCP catalog generator/spec —
 * so any tool here must be MCP-surfaced.
 */
export const OVERLAP_GENERATION_TOOLS: SourceTool[] = [
  {
    creditCost: 5,
    description:
      'Generate a batch of content (images, videos, carousels) for a brand. Specify count, platforms, and date range. Use handle param to resolve @username to a credential. Returns a batch ID for tracking.',
    name: 'generate_content_batch',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        contentMix: {
          description:
            'Content format distribution (e.g., { imagePercent: 60, videoPercent: 25, carouselPercent: 10, reelPercent: 5, storyPercent: 0 })',
          type: 'object',
        },
        count: {
          description: 'Number of content pieces to generate (1-100)',
          type: 'number',
        },
        dateRange: {
          description:
            'Date range for scheduling (e.g., { start: "2026-02-10", end: "2026-02-17" })',
          type: 'object',
        },
        handle: {
          description:
            'Social media handle to resolve (e.g., "@shaylamonroe"). Will auto-resolve to brandId and credential.',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
        style: {
          description:
            'Style direction for generation (e.g., "lifestyle", "professional", "urban")',
          type: 'string',
        },
        topics: {
          description: 'Content topics or themes',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['count', 'platforms'],
      type: 'object',
    },
    requiredRole: 'user',
    // Surfaced on MCP (PR 5/6): dispatches through the agent-executor to
    // `POST /agent-tools/generate_content_batch/execute`; the write is gated by
    // APPROVAL_REQUIRED_TOOLS so it queues a human approval before running.
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
];
