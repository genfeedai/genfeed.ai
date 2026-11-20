import type { McpCatalogToolSpec } from '../../interfaces/mcp-catalog-call.interface';
import type { SourceTool } from '../../interfaces/source-tool.interface';
import type { ToolParameterSchema } from '../../interfaces/tool-definition.interface';

const ROLE_RANK = { admin: 1, superadmin: 2, user: 0 } as const;
const SENTENCE_END = /(?<=[.!?])\s/u;

/** The parameter schema without the fields MCP callers cannot use. */
function visibleParameters(tool: SourceTool): ToolParameterSchema {
  const hidden = new Set(tool.mcpHiddenParameters ?? []);
  if (hidden.size === 0) return tool.parameters;
  return {
    ...tool.parameters,
    properties: Object.fromEntries(
      Object.entries(tool.parameters.properties).filter(
        ([key]) => !hidden.has(key),
      ),
    ),
    ...(tool.parameters.required
      ? {
          required: tool.parameters.required.filter((key) => !hidden.has(key)),
        }
      : {}),
  };
}

/** The first sentence of a tool's description, as the one-line summary of its action. */
function summarize(text: string): string {
  const [first] = text.split(SENTENCE_END, 1);
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

function hasRequiredInput(parameters: ToolParameterSchema): boolean {
  return (parameters.required?.length ?? 0) > 0;
}

/**
 * The listed definition of a merged MCP tool: `action` plus one `input` object
 * that matches the schema of the original tool the action runs. Nothing here
 * is hand-copied, so the schema cannot drift from the tool it runs. The schema
 * is listed once: a top-level `oneOf` would list every original schema twice
 * and some clients drop it. Pricing, annotations and policy are derived from the same tools in
 * `deriveMcpCatalogPolicy`.
 */
export function composeMcpCatalogTool(
  spec: McpCatalogToolSpec,
  sources: ReadonlyMap<string, SourceTool>,
): SourceTool {
  const targets = spec.operations.map((operation) => {
    const target = sources.get(operation.executes);
    if (!target) {
      throw new Error(
        `MCP catalog tool ${spec.name} runs unknown tool ${operation.executes}`,
      );
    }
    return { operation, parameters: visibleParameters(target), target };
  });
  const requiredRole = targets
    .map(({ target }) => target.requiredRole)
    .reduce((least, role) =>
      ROLE_RANK[role] < ROLE_RANK[least] ? role : least,
    );
  const everyInputRequired = targets.every(({ parameters }) =>
    hasRequiredInput(parameters),
  );

  return {
    creditCost: 0,
    description: spec.description,
    ...(spec.mcpDescription ? { mcpDescription: spec.mcpDescription } : {}),
    name: spec.name,
    parameters: {
      additionalProperties: false,
      properties: {
        action: {
          description: targets
            .map(
              ({ operation, target }) =>
                `${operation.action}: ${summarize(target.mcpDescription ?? target.description)}`,
            )
            .join(' '),
          enum: spec.operations.map((operation) => operation.action),
          type: 'string',
        },
        input: {
          anyOf: targets.map(({ parameters }) => parameters),
          description: 'The fields of the chosen action.',
        },
      },
      required: everyInputRequired ? ['action', 'input'] : ['action'],
      type: 'object',
    },
    requiredRole,
  };
}
