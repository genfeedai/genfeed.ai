import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowContinuationReconcileService {
  constructor(
    private readonly continuations: WorkflowNodeContinuationService,
    private readonly coordinator: WorkflowNodeContinuationCoordinatorService,
    private readonly ingredients: IngredientsService,
    private readonly replicate: ReplicateService,
    private readonly webhooks: WebhooksService,
    private readonly logger: LoggerService,
  ) {}

  async reconcile(): Promise<void> {
    await this.coordinator.reconcileProviderContinuations();

    const candidates = await this.continuations.findReplicatePollCandidates();
    for (const candidate of candidates) {
      try {
        const prediction = (await this.replicate.getPrediction(
          candidate.externalId,
        )) as unknown as Record<string, unknown>;
        const status =
          typeof prediction.status === 'string' ? prediction.status : '';
        if (
          status === 'starting' ||
          status === 'processing' ||
          status === 'queued'
        ) {
          continue;
        }

        const ingredient = await this.ingredients.findOne({
          id: candidate.ingredientId,
          organizationId: candidate.organizationId,
        });
        if (!ingredient) {
          await this.coordinator.failProviderAction({
            error: `Continuation ingredient ${candidate.ingredientId} not found`,
            identity: {
              continuationId: candidate.continuationId,
              organizationId: candidate.organizationId,
            },
            provider: 'replicate',
            providerResult: { externalId: candidate.externalId },
          });
          continue;
        }

        const output = prediction.output;
        const outputUrl = Array.isArray(output)
          ? output.find((value) => isAllowedReplicateOutputUrl(value))
          : isAllowedReplicateOutputUrl(output)
            ? output
            : undefined;
        if ((status === 'succeeded' || status === 'completed') && outputUrl) {
          await this.webhooks.processMediaForIngredient(
            candidate.ingredientId,
            ingredient.category,
            outputUrl,
            candidate.externalId,
          );
          await this.coordinator.completeProviderAction({
            identity: {
              continuationId: candidate.continuationId,
              organizationId: candidate.organizationId,
            },
            provider: 'replicate',
            providerResult: { externalId: candidate.externalId },
          });
          continue;
        }

        const error =
          typeof prediction.error === 'string'
            ? prediction.error
            : `Replicate prediction ${candidate.externalId} ended with status ${status || 'unknown'}`;
        await this.webhooks.handleFailedGenerationForIngredient(
          candidate.ingredientId,
          error,
        );
        await this.coordinator.failProviderAction({
          error,
          identity: {
            continuationId: candidate.continuationId,
            organizationId: candidate.organizationId,
          },
          provider: 'replicate',
          providerResult: { externalId: candidate.externalId },
        });
      } catch (error: unknown) {
        this.logger.error(
          'WorkflowContinuationReconcileService failed to reconcile Replicate continuation',
          error,
          {
            continuationId: candidate.continuationId,
            organizationId: candidate.organizationId,
          },
        );
      }
    }

    // Provider polling records settlements in the same database outbox; this
    // second pass claims and resumes them without waiting for the next minute.
    await this.coordinator.reconcileProviderContinuations();
  }
}
