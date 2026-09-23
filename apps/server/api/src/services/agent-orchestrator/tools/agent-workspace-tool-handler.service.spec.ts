import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

function createHandler(): AgentWorkspaceToolHandler {
  return new AgentWorkspaceToolHandler(
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[0],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[1],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[2],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[3],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[4],
  );
}

describe('AgentWorkspaceToolHandler.openStudioHandoff', () => {
  it('refuses to invent a generate URL when no ingredient is present', async () => {
    const result = await createHandler().openStudioHandoff({ type: 'image' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('prepare_generation');
    expect(JSON.stringify(result)).not.toContain('/studio?type=');
    expect(JSON.stringify(result)).not.toContain('/g/');
  });

  it('opens an existing image in Library, not the retired gallery path', async () => {
    const result = await createHandler().openStudioHandoff({
      ingredientId: 'img-1',
      type: 'image',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        href: createLibraryAssetRoute(IngredientCategory.IMAGE, 'img-1'),
        ingredientId: 'img-1',
      }),
    );
    expect(result.nextActions?.[0]?.studioUrl).toBe(
      createLibraryAssetRoute(IngredientCategory.IMAGE, 'img-1'),
    );
    expect(JSON.stringify(result)).not.toContain('/g/');
    expect(JSON.stringify(result)).not.toContain('/studio?type=');
  });
});

describe('AgentWorkspaceToolHandler.requestMediaUpload', () => {
  function fixture() {
    const uploads = {
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        id: 'asset-1',
        uploadMethod: 'PUT',
        uploadUrl: 'https://upload.example.test',
        publicUrl: 'https://cdn.example.test/asset-1',
        s3Key: 'asset-1',
        expiresIn: 3600,
      }),
    };
    const handler = new AgentWorkspaceToolHandler(
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[0],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[1],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[2],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[3],
      uploads as unknown as ConstructorParameters<
        typeof AgentWorkspaceToolHandler
      >[4],
    );
    return { handler, uploads };
  }
  const params = {
    filename: 'photo.png',
    contentType: 'image/png',
    category: 'image',
  };
  const ctx: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
    threadId: 'thread-1',
    validatedScope: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      source: 'explicit',
    },
  };

  it('preserves the validated thread brand when the direct brand is absent', async () => {
    const { handler, uploads } = fixture();
    expect((await handler.requestMediaUpload(params, ctx)).success).toBe(true);
    expect(uploads.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
      expect.anything(),
    );
  });

  it('rejects brandless uploads before reserving an asset', async () => {
    const { handler, uploads } = fixture();
    const result = await handler.requestMediaUpload(params, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('brand');
    expect(uploads.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('returns the files service self-hosted POST_JSON instructions', async () => {
    const { handler, uploads } = fixture();
    uploads.getPresignedUploadUrl.mockResolvedValue({
      id: 'asset-1',
      uploadMethod: 'POST_JSON',
      uploadUrl: 'http://files.local/v1/files/upload',
      publicUrl: 'http://files.local/asset-1',
      s3Key: 'asset-1',
      expiresIn: 3600,
    });
    const result = await handler.requestMediaUpload(params, {
      ...ctx,
      brandId: 'brand-1',
    });
    expect(result.data).toMatchObject({
      method: 'POST_JSON',
      localUpload: {
        key: 'asset-1',
        sourceType: 'base64',
        type: IngredientCategory.IMAGE,
      },
    });
    expect(result.data).not.toHaveProperty('headers');
  });
});
