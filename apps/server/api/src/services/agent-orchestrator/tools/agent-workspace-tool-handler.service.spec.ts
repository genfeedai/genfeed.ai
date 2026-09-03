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
