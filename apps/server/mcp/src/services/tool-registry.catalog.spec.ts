import { MCP_TOOL_CAP, type McpToolOutput } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it, vi } from 'vitest';

/** The real catalog: every connection lists every tool, so there is nothing to select. */

const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

function build(
  role: 'user' | 'admin' | 'superadmin',
  accessMode: 'standard' | 'claude' | 'admin' = 'standard',
) {
  return new ToolRegistryService(
    {} as unknown as ClientService,
    logger as unknown as LoggerService,
    role,
    undefined,
    accessMode,
  );
}

const names = (tools: McpToolOutput[]): string[] =>
  tools.map((tool) => tool.name).sort();

describe('ToolRegistryService real catalog listing', () => {
  it('lists the same 29 tools to every role on the standard endpoint, inside the cap', () => {
    const user = names(build('user').getTools());
    expect(user).toHaveLength(29);
    expect(user.length).toBeLessThanOrEqual(MCP_TOOL_CAP);
    expect(names(build('superadmin').getTools())).toEqual(user);
  });

  it('lists the merged tools and none of the retired names', () => {
    const listed = names(build('user').getTools());
    expect(listed).toEqual(
      expect.arrayContaining([
        'check_channel',
        'find_tools',
        'get_content',
        'get_insights',
        'run_video_project',
        'upload_media',
      ]),
    );
    for (const name of [
      'get_scheduler_capabilities',
      'validate_scheduler_target',
      'request_media_upload',
      'complete_media_upload',
      'create_clipper_project_from_youtube',
    ])
      expect(listed).not.toContain(name);
  });

  it('keeps the admin-only tools off the standard endpoint', () => {
    const listed = names(build('superadmin').getTools());
    expect(listed).not.toContain('resolve_approval');
    expect(listed).not.toContain('create_brand_from_url');
  });
});
