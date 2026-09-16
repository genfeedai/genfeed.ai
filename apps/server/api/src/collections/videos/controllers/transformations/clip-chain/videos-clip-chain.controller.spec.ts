import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { VideosClipChainController } from '@api/collections/videos/controllers/transformations/clip-chain/videos-clip-chain.controller';
import type { WorkflowVisualNodeDto } from '@api/collections/workflows/dto/create-workflow.dto';
import type { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((_source, id) => {
    throw new Error(`${id} not found`);
  }),
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));

const user = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;

const stills: Record<string, Record<string, unknown>> = {
  'character-1': {
    brandId: 'brand-1',
    category: IngredientCategory.AVATAR,
    id: 'character-1',
    status: IngredientStatus.VALIDATED,
  },
  'product-1': {
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
    id: 'product-1',
    status: IngredientStatus.UPLOADED,
  },
  'room-1': {
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
    id: 'room-1',
    status: IngredientStatus.GENERATED,
  },
  'stranger-1': {
    brandId: 'brand-2',
    category: IngredientCategory.IMAGE,
    id: 'stranger-1',
    status: IngredientStatus.GENERATED,
  },
};

function createHarness() {
  const ingredientsService = {
    findOne: vi.fn(async (where: { id: string }) => stills[where.id] ?? null),
  };
  const workflowsService = {
    createWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1' }),
  };
  const controller = new VideosClipChainController(
    ingredientsService as unknown as IngredientsService,
    workflowsService as unknown as WorkflowsService,
  );
  return { controller, ingredientsService, workflowsService };
}

function videoGenNodes(nodes: WorkflowVisualNodeDto[]) {
  return nodes.filter(
    (node) =>
      (node.data?.config as { actionId?: string } | undefined)?.actionId ===
      'videoGen',
  );
}

describe('VideosClipChainController', () => {
  it('stores the run identity once and attaches the same identity refs to every segment', async () => {
    const { controller, ingredientsService, workflowsService } =
      createHarness();

    const result = await controller.createClipChain({} as Request, user, {
      characterIngredientIds: ['character-1'],
      environmentIngredientIds: ['room-1'],
      model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      productIngredientIds: ['product-1'],
      segmentPrompts: ['Beat one', 'Beat two', 'Beat three'],
    });

    expect(result).toEqual({ id: 'workflow-1' });
    for (const id of ['character-1', 'product-1', 'room-1']) {
      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        id,
        isDeleted: false,
        organizationId: 'org-1',
      });
    }
    const [userId, organizationId, workflowDto, brandId] =
      workflowsService.createWorkflow.mock.calls[0];
    expect([userId, organizationId, brandId]).toEqual([
      'user-1',
      'org-1',
      'brand-1',
    ]);
    expect(workflowDto.metadata).toEqual({
      identity: {
        characterIngredientIds: ['character-1'],
        environmentIngredientIds: ['room-1'],
        productIngredientIds: ['product-1'],
      },
      model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      segmentCount: 3,
      templateId: 'clip-chain-video',
    });

    const segments = videoGenNodes(workflowDto.nodes);
    expect(segments).toHaveLength(3);
    const expectedReferences = [
      { assetId: 'character-1', role: 'character' },
      { assetId: 'product-1', role: 'product' },
      { assetId: 'room-1', role: 'subject' },
    ];
    for (const segment of segments) {
      expect(segment.data?.config).toMatchObject({
        actionId: 'videoGen',
        parameters: {
          brandId: 'brand-1',
          identityReferences: expectedReferences,
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        },
      });
    }
    // Last-frame extract stays a start-frame handoff, never an identity ref.
    expect(workflowDto.edges).toContainEqual(
      expect.objectContaining({
        source: 'frame-extract-1',
        sourceHandle: 'last_frame',
        target: 'video-gen-2',
        targetHandle: 'image',
      }),
    );
  });

  it('rejects a deleted or foreign ingredient before creating a workflow', async () => {
    const { controller, workflowsService } = createHarness();

    await expect(
      controller.createClipChain({} as Request, user, {
        characterIngredientIds: ['character-1'],
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        productIngredientIds: ['missing-1'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('rejects an ingredient owned by another brand', async () => {
    const { controller, workflowsService } = createHarness();

    await expect(
      controller.createClipChain({} as Request, user, {
        characterIngredientIds: ['stranger-1'],
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).rejects.toThrow('does not belong to the selected brand');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('fails closed when the model cannot carry identity stills', async () => {
    const { controller, workflowsService } = createHarness();

    await expect(
      controller.createClipChain({} as Request, user, {
        characterIngredientIds: ['character-1'],
        model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      }),
    ).rejects.toThrow('cannot honor an identity lock');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('requires one prompt per segment when both are supplied', async () => {
    const { controller, workflowsService } = createHarness();

    await expect(
      controller.createClipChain({} as Request, user, {
        characterIngredientIds: ['character-1'],
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        segmentCount: 4,
        segmentPrompts: ['Beat one', 'Beat two'],
      }),
    ).rejects.toThrow('one prompt per segment');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('guards the route with subscription and model validation', () => {
    const handler = Object.getOwnPropertyDescriptor(
      VideosClipChainController.prototype,
      'createClipChain',
    )?.value;

    expect(Reflect.getMetadata('__guards__', handler)).toEqual([
      SubscriptionGuard,
      ModelsGuard,
    ]);
  });
});
