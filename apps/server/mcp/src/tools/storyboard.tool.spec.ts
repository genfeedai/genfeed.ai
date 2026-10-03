import { getToolByName } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import {
  handleStoryboardTool,
  STORYBOARD_TOOL_NAMES,
} from '@mcp/tools/storyboard.tool';
import { describe, expect, it, vi } from 'vitest';

describe('storyboard MCP tools', () => {
  it('keeps remix creation and character replace off core and at zero credits', () => {
    expect([...STORYBOARD_TOOL_NAMES].sort()).toEqual([
      'create_storyboard_remix',
      'replace_storyboard_character',
      'storyboard_run_capabilities',
    ]);
    expect(getToolByName('create_storyboard_remix')).toMatchObject({
      creditCost: 0,
      mutationPolicy: 'direct',
      surfaces: { agent: false, mcp: true },
      toolset: 'inspiration',
    });
    expect(getToolByName('replace_storyboard_character')).toMatchObject({
      creditCost: 0,
      mutationPolicy: 'approval-required',
      surfaces: { agent: false, mcp: true },
      toolset: 'inspiration',
    });
    expect(getToolByName('create_storyboard_remix')?.annotations).toMatchObject(
      {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    );
    expect(
      getToolByName('replace_storyboard_character')?.annotations,
    ).toMatchObject({
      destructiveHint: true,
      openWorldHint: true,
      readOnlyHint: false,
    });
  });

  it('creates an uploaded-video storyboard run and replaces one shot', async () => {
    const createStoryboardRemix = vi.fn(async () => ({ id: 'run-1' }));
    const replaceStoryboardCharacter = vi.fn(async () => ({
      chargedCredits: 0,
      requestId: 'req-1',
    }));
    const client = {
      createStoryboardRemix,
      replaceStoryboardCharacter,
    } as unknown as ClientService;

    await handleStoryboardTool(client, 'create_storyboard_remix', {
      assetId: 'video-1',
      brandId: 'brand-1',
      clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    });
    await handleStoryboardTool(client, 'replace_storyboard_character', {
      brandId: 'brand-1',
      imageAssetIds: ['image-1'],
      runId: 'run-1',
      shotId: 'shot-1',
    });

    expect(createStoryboardRemix).toHaveBeenCalledWith({
      assetId: 'video-1',
      brandId: 'brand-1',
      clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    });
    expect(replaceStoryboardCharacter).toHaveBeenCalledWith({
      brandId: 'brand-1',
      imageAssetIds: ['image-1'],
      runId: 'run-1',
      shotId: 'shot-1',
    });
  });
});
