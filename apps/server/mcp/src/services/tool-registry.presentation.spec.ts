import { getToolsForSurface } from '@genfeedai/actions';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';

const fixture = {
  id: 'result-private',
  organizationId: 'org-private',
  name: 'Example result',
  title: 'Example result',
  label: 'Example result',
  status: 'COMPLETED',
  content: 'Example content',
  url: 'https://example.com/result',
  expiresInSeconds: 60,
  conversations: [],
  messages: [],
  count: 0,
  profile: {
    role: 'user',
    userId: 'user-private',
    isOnboardingCompleted: true,
  },
  uploadUrl: 'https://storage.example.com/upload?secret=private',
};

function inputFor(schema: unknown, key = ''): unknown {
  if (!isRecord(schema)) return 'Example';
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.anyOf)) return inputFor(schema.anyOf[0], key);
  if (schema.type === 'object' || isRecord(schema.properties)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    return Object.fromEntries(
      (Array.isArray(schema.required) ? schema.required : [])
        .filter((name): name is string => typeof name === 'string')
        .map((name) => [name, inputFor(properties[name], name)]),
    );
  }
  if (schema.type === 'array') return [inputFor(schema.items, key)];
  if (schema.type === 'boolean') return true;
  if (schema.type === 'number' || schema.type === 'integer') return 1;
  if (/url/i.test(key)) return 'https://example.com/source';
  if (/clientRequestId/.test(key))
    return '00000000-0000-4000-8000-000000000001';
  if (/Id$|Ids$/.test(key)) return 'input-private';
  if (key === 'timezone') return 'UTC';
  if (key === 'slug') return 'example';
  return 'Example';
}

function build() {
  let approval: Record<string, unknown> = {};
  const methods: Record<string, ReturnType<typeof vi.fn>> = {
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ success: true, creditsUsed: 0, data: fixture }),
    evaluateMcpToolResult: vi.fn().mockResolvedValue({ outcome: 'allowed' }),
    createApproval: vi.fn(async (toolName, args) => {
      approval = {
        id: 'approval-private',
        status: 'PENDING',
        toolName,
        arguments: args,
      };
      return approval;
    }),
    resolveApproval: vi.fn(async () => ({ ...approval, status: 'APPROVED' })),
  };
  const client = new Proxy(methods, {
    get(target, key: string) {
      target[key] ??= vi
        .fn()
        .mockResolvedValue(
          /^(list|search|compare)|TopPerformers$/.test(key)
            ? key === 'listSocialConversations'
              ? fixture
              : [fixture]
            : fixture,
        );
      return target[key];
    },
  });
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  };
  return new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'superadmin',
  );
}

describe('MCP catalog presentation through the public registry', () => {
  it.each(getToolsForSurface('mcp'))(
    '$name keeps IDs in structured results and returns readable display text',
    async (tool) => {
      const registry = build();
      const args = inputFor(tool.parameters) as Record<string, unknown>;
      if (tool.name === 'get_articles') args.query = 'AI';
      if (tool.name === 'update_remix_concept')
        args.edits = { output: { count: 2 } };
      if (tool.name === 'onboard_brand') args.action = 'complete';
      if (tool.name === 'create_clip_project_from_youtube')
        args.brandId = 'input-private';
      if (tool.name === 'generate_clips') args.mode = 'raw-cut';
      if (tool.name === 'update_scheduled_release')
        args.changes = { title: 'Example' };
      if (
        [
          'generate',
          'generate_content',
          'enhance_prompt',
          'transform_media',
          'generate_turbo_content',
        ].includes(tool.name)
      )
        args.brandId = 'input-private';
      if (tool.name === 'resolve_approval') args.decision = 'decline';
      // The listing fixture is the only organization the user can switch to.
      if (tool.name === 'switch_org') args.organization = fixture.id;

      let result = (await registry.handleToolCall({
        name: tool.name,
        arguments: args,
      })) as McpAppResult;
      if (result.structuredContent?.code === 'approval_pending') {
        expect(result.structuredContent.approvalId).toBe('approval-private');
        expect(result.content).toEqual([
          {
            type: 'text',
            text: expect.not.stringContaining('approval-private'),
          },
        ]);
        result = (await registry.handleToolCall({
          name: 'resolve_approval',
          arguments: { approvalId: 'approval-private', decision: 'approve' },
        })) as McpAppResult;
      }
      const visible = result.content
        .flatMap((part) =>
          isRecord(part) && part.type === 'text' ? [part.text] : [],
        )
        .join('\n')
        .replace(/\]\([^)]*\)/g, ']');
      expect(result.isError, visible).not.toBe(true);
      expect(visible).toBeTruthy();
      expect(visible).not.toMatch(
        /result-private|org-private|user-private|approval-private|"id"\s*:/,
      );
      if (!['find_tools', 'resolve_approval'].includes(tool.name))
        expect(result.structuredContent?.data).toBeDefined();
    },
  );
});
