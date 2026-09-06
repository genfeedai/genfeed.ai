import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import {
  buildSocialSourceHistoryImportWorkflowDefinition,
  SOCIAL_SOURCE_HISTORY_IMPORT_ACTION_IDS,
} from '@api/collections/social-sources/services/social-source-history-import-workflow-definition';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SocialSourceHistoryImportWorkflowInput } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

interface HistoryImportRunResult {
  importedCount: number;
  provider: string | null;
  rejectedCount: number;
  sourceId: string;
}

/**
 * Executes the own-account history import system workflow. Registered in the
 * API and worker processes alike; the queue decides where a run lands.
 */
@Injectable()
export class SocialSourceHistoryImportWorkflowService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historyImport: SocialSourceHistoryImportService,
    private readonly socialSourcesService: SocialSourcesService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      SOCIAL_SOURCE_HISTORY_IMPORT_ACTION_IDS.RUN,
      ({ input }) =>
        this.run(input.request as SocialSourceHistoryImportWorkflowInput),
    );
    this.runner.registerWorkflow(
      buildSocialSourceHistoryImportWorkflowDefinition(),
    );
  }

  async run(
    request: SocialSourceHistoryImportWorkflowInput,
  ): Promise<HistoryImportRunResult> {
    const source = await this.prisma.socialSource.findFirst({
      where: scopedWhere(request.organizationId, {
        brandId: request.brandId,
        id: request.sourceId,
      }),
    });
    if (!source) {
      throw new Error(
        `Own-account source ${request.sourceId} is not available for history import`,
      );
    }

    await this.historyImport.markRunning(source);
    const since = new Date(
      Date.now() - request.windowDays * 24 * 60 * 60 * 1000,
    );

    try {
      const result = await this.socialSourcesService.importHistory(source, {
        limit: request.limit,
        since,
      });
      await this.historyImport.markCompleted(source, {
        importedCount: result.count,
        provider: result.provider ?? null,
        rejectedCount: result.rejectedCount,
      });
      this.logger.log('Social account history import completed', {
        importedCount: result.count,
        provider: result.provider,
        sourceId: source.id,
      });
      return {
        importedCount: result.count,
        provider: result.provider ?? null,
        rejectedCount: result.rejectedCount,
        sourceId: source.id,
      };
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Social account history import failed';
      await this.historyImport.markFailed(source, message);
      throw error;
    }
  }
}
