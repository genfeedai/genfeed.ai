import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { withMergedToolCalls } from '@mcp/services/tool-registry.endpoints.testing';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Deleting a post or a Library asset is confirmed with the person in the
 * conversation: the first call deletes nothing, and never reaches the web
 * approvals queue (#10880).
 */
function build(mode: 'standard' | 'claude' = 'standard') {
  const client = {
    createApproval: vi.fn(),
    deleteAsset: vi
      .fn()
      .mockResolvedValue({ assetId: 'asset-1', verified: true }),
    deletePost: vi.fn().mockResolvedValue({
      deletedOnPlatform: false,
      media: {
        deleted: ['asset-1', 'asset-2'],
        kept: [{ id: 'asset-3', reason: 'used-by-another-post' }],
      },
      platform: 'instagram',
      postId: 'post-1',
      previousStatus: 'public',
      publishedUrl: 'https://www.instagram.com/p/abc/',
      verified: { mediaGone: true, postGone: true },
    }),
    executeAgentTool: vi.fn(),
    isApprovalRequired: vi.fn().mockResolvedValue(true),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = withMergedToolCalls(
    new ToolRegistryService(
      client as unknown as ClientService,
      logger as unknown as LoggerService,
      'user',
      undefined,
      mode,
    ),
  );
  return { client, registry };
}

describe('delete_post and delete_asset', () => {
  it.each([
    { arguments: { deleteMedia: true, postId: 'post-1' }, name: 'delete_post' },
    { arguments: { assetId: 'asset-1' }, name: 'delete_asset' },
  ])(
    'deletes nothing on the first $name call and queues no approval',
    async (call) => {
      const { client, registry } = build();

      const result = await registry.handleToolCall(call);

      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          code: 'confirmation_required',
          toolName: call.name,
        },
      });
      expect(JSON.stringify(result)).toContain('Nothing was deleted');
      expect(JSON.stringify(result)).toContain(
        'stays live on the social network',
      );
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(client.deletePost).not.toHaveBeenCalled();
      expect(client.deleteAsset).not.toHaveBeenCalled();
    },
  );

  it('deletes the post and its media once the person has agreed, and reports the read-back', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { confirmed: true, deleteMedia: true, postId: 'post-1' },
      name: 'delete_post',
    })) as {
      content: { text: string }[];
      structuredContent: { data: unknown };
    };

    expect(client.deletePost).toHaveBeenCalledWith({
      deleteMedia: true,
      postId: 'post-1',
    });
    expect(client.createApproval).not.toHaveBeenCalled();
    const text = result.content[0].text;
    expect(text).toContain(
      'Library media deleted: 2; kept: 1 (asset-3: used-by-another-post)',
    );
    expect(text).toContain('was not deleted on the social network');
    expect(text).toContain('the post and its deleted media are gone');
    expect(result.structuredContent.data).toMatchObject({
      deletedOnPlatform: false,
      verified: { mediaGone: true, postGone: true },
    });
  });

  it('does not report a post deleted when the read-back still finds it', async () => {
    const { client, registry } = build();
    client.deletePost.mockResolvedValueOnce({
      deletedOnPlatform: false,
      media: { deleted: [], kept: [] },
      platform: null,
      postId: 'post-1',
      previousStatus: 'draft',
      publishedUrl: null,
      verified: { mediaGone: true, postGone: false },
    });

    const result = (await registry.handleToolCall({
      arguments: { confirmed: true, postId: 'post-1' },
      name: 'delete_post',
    })) as { content: { text: string }[] };

    expect(result.content[0].text).toContain('Read back FAILED');
    expect(client.deletePost).toHaveBeenCalledWith({ postId: 'post-1' });
  });

  it('deletes an asset once the person has agreed', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { assetId: 'asset-1', confirmed: true },
      name: 'delete_asset',
    })) as { content: { text: string }[] };

    expect(client.deleteAsset).toHaveBeenCalledWith('asset-1');
    expect(result.content[0].text).toContain('no longer resolves');
  });

  it.each([
    { arguments: { confirmed: true, postId: 'post-1' }, name: 'delete_post' },
    {
      arguments: { assetId: 'asset-1', confirmed: true },
      name: 'delete_asset',
    },
  ])('does not offer $name to the Claude connector', async (call) => {
    const { client, registry } = build('claude');

    const result = await registry.handleToolCall(call);

    expect(result).toMatchObject({ isError: true });
    expect(client.deletePost).not.toHaveBeenCalled();
    expect(client.deleteAsset).not.toHaveBeenCalled();
  });
});
