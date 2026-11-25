import type {
  OpenRouterMessage,
  OpenRouterTool,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';

/** Name of the meta tool the model calls to load tools outside its core set. */
export const FIND_TOOLS_TOOL_NAME = 'find_tools';

/**
 * A turn whose tool pool is at or below this size sends every tool. Typed
 * specialists carry a short curated list already; only the general chat, which
 * pools the whole agent catalog, needs the core set and on-demand loading.
 */
export const LAZY_TOOLSET_MIN_TOOLS = 30;

/**
 * Upper bound, in bytes of JSON, for the tool definitions sent on one model
 * request when the toolset is lazy. The full catalog is about 180 KB; the core
 * set is held well under this so growth shows up as a failing spec instead of
 * a bigger bill on every round of every turn.
 */
export const AGENT_CORE_TOOLS_PAYLOAD_BUDGET_BYTES = 40_000;

/**
 * The tools every chat turn starts with: read the brand and account, ask the
 * person with cards, plan work, draft a post, prepare a generation, and render
 * the dashboard. Everything else loads through `find_tools` or on first call.
 */
export const AGENT_CORE_TOOL_NAMES: readonly string[] = [
  'get_current_brand',
  'get_brands',
  'get_brand_context',
  'get_account',
  'request_input',
  'suggest_next_steps',
  'update_task_list',
  'present_work_object',
  'create_post',
  'generate_content',
  'get_posts',
  'get_assets',
  'schedule_post',
  'prepare_generation',
  'get_analytics',
  'get_workflows',
  'search_knowledge',
  'render_dashboard',
];

const FIND_TOOLS_TOOL: OpenRouterTool = {
  function: {
    description:
      'Your tool list is short on purpose. Search the rest of the Genfeed tool catalog by what you need to do, using a verb or topic such as "schedule", "workflow", "clip", "storyboard" or "knowledge". Matching tools load for the rest of this turn: call them in your next step. Free.',
    name: FIND_TOOLS_TOOL_NAME,
    parameters: {
      properties: {
        limit: {
          description: 'Maximum number of tools to load (1-12). Defaults to 8.',
          maximum: 12,
          minimum: 1,
          type: 'number',
        },
        query: {
          description:
            'What you need to do, or an exact tool name, in a few words.',
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
  },
  type: 'function',
};

const SENTENCE_BOUNDARY = /(?<=[.!?])\s/;
const NON_WORD = /[^a-z0-9_]+/;
const DEFAULT_FIND_LIMIT = 8;
const MAX_FIND_LIMIT = 12;
const SUMMARY_MAX_LENGTH = 160;

interface FoundTool {
  description: string;
  name: string;
}

interface FindToolsResult {
  found: FoundTool[];
  message: string;
}

function summarize(description: string): string {
  const firstSentence = description.split(SENTENCE_BOUNDARY)[0] ?? description;
  return firstSentence.length > SUMMARY_MAX_LENGTH
    ? `${firstSentence.slice(0, SUMMARY_MAX_LENGTH - 1)}…`
    : firstSentence;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(NON_WORD)
    .filter((token) => token.length > 1);
}

/**
 * The tool definitions one turn sends to the model, and the rest of the pool
 * it can load. Per turn state: a tool loaded in one round stays loaded for the
 * later rounds, so a request that needs a second step does not search twice.
 */
export class TurnToolset {
  private readonly loaded = new Set<string>();
  private readonly byName: Map<string, OpenRouterTool>;

  constructor(
    private readonly pool: OpenRouterTool[],
    readonly isLazy: boolean,
  ) {
    this.byName = new Map(pool.map((tool) => [tool.function.name, tool]));
  }

  /** Definitions for this round's request: everything, or core plus loaded. */
  roundTools(): OpenRouterTool[] {
    if (!this.isLazy) return this.pool;
    return [
      FIND_TOOLS_TOOL,
      ...this.pool.filter(
        (tool) =>
          AGENT_CORE_TOOL_NAMES.includes(tool.function.name) ||
          this.loaded.has(tool.function.name),
      ),
    ];
  }

  /** Loads a tool for the later rounds; a name outside the pool is ignored. */
  load(name: string): void {
    if (this.isLazy && this.byName.has(name)) this.loaded.add(name);
  }

  /**
   * Answers a `find_tools` call as the tool message for the model, and loads
   * what it finds. `find_tools` is local to the turn, so it has no credit,
   * confirmation or tool-card path. Returns null for any other call.
   */
  answerFindTools(
    toolCall: OpenRouterToolCallResponse,
  ): OpenRouterMessage | null {
    if (!this.isLazy || toolCall.function.name !== FIND_TOOLS_TOOL_NAME)
      return null;
    let args: { limit?: unknown; query?: unknown } = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      // An unreadable argument string is an empty query, and nothing matches it.
    }
    const result = this.find(
      typeof args.query === 'string' ? args.query : '',
      typeof args.limit === 'number' ? args.limit : undefined,
    );
    return {
      content: JSON.stringify({
        data: { found: result.found, message: result.message },
        success: true,
      }),
      role: 'tool',
      tool_call_id: toolCall.id,
    };
  }

  /** Matches the pool against a query and loads what it finds. */
  find(query: string, requestedLimit?: number): FindToolsResult {
    const limit = Math.min(
      Math.max(Math.trunc(requestedLimit ?? DEFAULT_FIND_LIMIT), 1),
      MAX_FIND_LIMIT,
    );
    const exact = this.byName.get(query.trim());
    const tokens = tokenize(query);
    const scored = exact
      ? [{ score: Number.MAX_SAFE_INTEGER, tool: exact }]
      : this.pool
          .map((tool) => {
            const name = tool.function.name.toLowerCase();
            const description = tool.function.description.toLowerCase();
            const score = tokens.reduce(
              (total, token) =>
                total +
                (name.includes(token) ? 3 : 0) +
                (description.includes(token) ? 1 : 0),
              0,
            );
            return { score, tool };
          })
          .filter((entry) => entry.score > 0)
          .sort(
            (left, right) =>
              right.score - left.score ||
              left.tool.function.name.localeCompare(right.tool.function.name),
          );

    const found = scored.slice(0, limit).map(({ tool }) => {
      this.load(tool.function.name);
      return {
        description: summarize(tool.function.description),
        name: tool.function.name,
      };
    });

    return {
      found,
      message:
        found.length > 0
          ? 'These tools are loaded now. Call the one you need in your next step.'
          : 'No tool matched. Try a different verb or topic, or answer without a tool.',
    };
  }
}

/** Lazy only when the pool is the whole catalog, not a curated specialist list. */
export function createTurnToolset(tools: OpenRouterTool[]): TurnToolset {
  return new TurnToolset(tools, tools.length > LAZY_TOOLSET_MIN_TOOLS);
}
