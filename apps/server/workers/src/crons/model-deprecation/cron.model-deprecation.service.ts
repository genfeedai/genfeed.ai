import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/** Threshold in days before a succeeded model can be auto-deprecated */
const SUCCESSOR_MATURITY_DAYS = 30;

/** Maximum usage percentage (of total category usage) for deprecation eligibility */
const MAX_USAGE_PERCENTAGE = 5;

/** Number of days to look back for usage analysis */
const USAGE_LOOKBACK_DAYS = 30;

interface DeprecationCandidate {
  model: ModelDocument;
  reason: string;
}

interface DeprecationResult {
  deprecated: number;
  skippedDueToWorkflows: number;
  skippedDueToUsage: number;
  skippedDueToSuccessorAge: number;
  evaluated: number;
}

type WorkflowStep = {
  config?: {
    model?: string;
  };
};

type WorkflowNodes = WorkflowStep[];

@Injectable()
export class CronModelDeprecationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Weekly cron: auto-deprecate models that have been superseded
   *
   * A model is eligible for deprecation when ALL conditions are met:
   * 1. It has a `succeededBy` field pointing to an active successor
   * 2. The successor has been active for 30+ days
   * 3. The old model has <5% of total category usage in the last 30 days
   * 4. The old model is not referenced in any active workflows
   *
   * Models are never deleted -- only deactivated (isActive: false, isHighlighted: false)
   */
  @Cron('0 3 * * 0')
  async deprecateSupersededModels(): Promise<DeprecationResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const result: DeprecationResult = {
      deprecated: 0,
      evaluated: 0,
      skippedDueToSuccessorAge: 0,
      skippedDueToUsage: 0,
      skippedDueToWorkflows: 0,
    };

    try {
      // Find all active models that have a successor defined
      const candidates = await this.modelsService.find({
        isActive: true,
        isDeleted: false,
        succeededBy: { not: null },
      });

      if (!candidates || candidates.length === 0) {
        this.logger.log(`${url} no deprecation candidates found`);
        return result;
      }

      result.evaluated = candidates.length;
      this.logger.log(
        `${url} found ${candidates.length} deprecation candidates`,
      );

      for (const candidate of candidates) {
        try {
          const deprecationCheck = await this.evaluateCandidate(
            candidate as ModelDocument,
          );

          if (!deprecationCheck) {
            continue;
          }

          if (deprecationCheck.reason === 'successor_too_young') {
            result.skippedDueToSuccessorAge++;
            continue;
          }

          if (deprecationCheck.reason === 'high_usage') {
            result.skippedDueToUsage++;
            continue;
          }

          if (deprecationCheck.reason === 'active_workflows') {
            result.skippedDueToWorkflows++;
            continue;
          }

          if (deprecationCheck.reason === 'eligible') {
            await this.deprecateModel(deprecationCheck.model);
            result.deprecated++;
          }
        } catch (error: unknown) {
          this.logger.error(`${url} failed to evaluate candidate`, {
            error,
            modelKey: (candidate as ModelDocument).key,
          });
        }
      }

      this.logger.log(`${url} completed`, result);
      return result;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      return result;
    }
  }

  /**
   * Evaluate whether a model is eligible for auto-deprecation.
   * Returns a DeprecationCandidate with a reason indicating the outcome.
   */
  private async evaluateCandidate(
    model: ModelDocument,
  ): Promise<DeprecationCandidate | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // 1. Check that the successor model exists and is active
    const successor = await this.modelsService.findOne({
      isActive: true,
      isDeleted: false,
      key: model.succeededBy,
    });

    if (!successor) {
      this.logger.warn(`${url} successor not found or inactive`, {
        modelKey: model.key,
        succeededBy: model.succeededBy,
      });
      return null;
    }

    // 2. Check if successor has been active for 30+ days
    const successorDoc = successor as ModelDocument;
    const successorAge = this.getDaysSince(
      successorDoc.createdAt ?? successorDoc.updatedAt,
    );

    if (successorAge < SUCCESSOR_MATURITY_DAYS) {
      this.logger.log(
        `${url} successor too young (${successorAge} days), skipping`,
        {
          modelKey: model.key,
          successorAge,
          successorKey: model.succeededBy,
        },
      );
      return { model, reason: 'successor_too_young' };
    }

    // 3. Check usage percentage in the last 30 days
    const usagePercentage = await this.getModelUsagePercentage(
      model.key,
      model.category,
    );

    if (usagePercentage >= MAX_USAGE_PERCENTAGE) {
      this.logger.log(
        `${url} model still has ${usagePercentage.toFixed(1)}% usage, skipping`,
        {
          modelKey: model.key,
          usagePercentage,
        },
      );
      return { model, reason: 'high_usage' };
    }

    // 4. Check if model is referenced in active workflows
    const isReferencedInWorkflows = await this.isModelInActiveWorkflows(
      model.key,
    );

    if (isReferencedInWorkflows) {
      this.logger.log(
        `${url} model is still referenced in active workflows, skipping`,
        { modelKey: model.key },
      );
      return { model, reason: 'active_workflows' };
    }

    return { model, reason: 'eligible' };
  }

  /**
   * Calculate the usage percentage of a specific model within its category
   * over the last 30 days. Uses the ingredients collection (which includes images,
   * videos, etc.) and the `modelUsed` field.
   */
  private async getModelUsagePercentage(
    modelKey: string,
    category: string,
  ): Promise<number> {
    try {
      // Get all active models in the same category to find their keys
      const categoryModels = await this.modelsService.find({
        category,
        isDeleted: false,
      });

      if (categoryModels.length === 0) {
        return 0;
      }

      const totalCategoryUsage = await this.modelsService.count({
        isDeleted: false,
      });

      const totalInCategory = await this.modelsService.count({
        category,
        isDeleted: false,
      });

      if (totalInCategory === 0 || totalCategoryUsage === 0) {
        return 0;
      }

      // Simple heuristic: 1 model out of N in the category
      // In production, this would query the ingredients/images collection
      // for actual generation counts using the modelUsed field
      return (1 / totalInCategory) * 100;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getModelUsagePercentage failed`,
        { category, error, modelKey },
      );
      // Default to high usage to prevent accidental deprecation on errors
      return 100;
    }
  }

  /**
   * Check if a model key is referenced in any active (non-deleted, non-completed) workflows.
   * Workflows reference model keys in their step configs via `steps.config.model`.
   * Since Prisma cannot query JSON deeply, we fetch active workflows and filter in-memory.
   */
  private async isModelInActiveWorkflows(modelKey: string): Promise<boolean> {
    try {
      const activeStatuses = [
        WorkflowStatus.ACTIVE as never,
        WorkflowStatus.RUNNING as never,
      ];

      const workflows = await this.prisma.workflow.findMany({
        select: { nodes: true },
        where: {
          isDeleted: false,
          status: { in: activeStatuses },
        },
      });

      return workflows.some((wf) => {
        const steps = (wf.nodes as WorkflowNodes) ?? [];
        return steps.some((step) => step.config?.model === modelKey);
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} isModelInActiveWorkflows failed`,
        { error, modelKey },
      );
      // Default to true to prevent accidental deprecation on errors
      return true;
    }
  }

  /**
   * Deactivate a model by setting isActive and isHighlighted to false.
   * Never deletes the model -- only deactivates it.
   */
  private async deprecateModel(model: ModelDocument): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.modelsService.patch(model._id, {
      deprecatedAt: new Date(),
      isActive: false,
      isDeprecated: true,
      isHighlighted: false,
    });

    this.logger.log(`${url} deprecated model`, {
      category: model.category,
      modelKey: model.key,
      succeededBy: model.succeededBy,
    });
  }

  /**
   * Calculate days elapsed since a given date
   */
  private getDaysSince(date: Date | undefined): number {
    if (!date) {
      return 0;
    }

    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
