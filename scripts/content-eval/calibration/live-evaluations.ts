/**
 * Runs the production text evaluations with global database templates and
 * anonymised context. The bridge enforces structured decoding; production
 * parses free text. Its response schema omits the persuasion dimension.
 */

import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EvalMessage } from '../contracts';
import { MeteredCallError, meteredCall, sha256Digest } from '../provenance';
import { SpendCapExceededError } from '../spend';
import {
  EVALUATIONS_JUDGE_SCHEMA_NAME,
  evaluationsJudgeResponseSchema,
  evaluationsResultSchema,
} from './contracts';
import type {
  ArmCallResult,
  EvaluationsCompletionBridge,
  EvaluationsScorerOptions,
  EvaluationsScorerPort,
} from './types';

@Module({})
class CalibrationEvaluationsModule {}

export function createEvaluationsCompletionBridge(
  options: EvaluationsScorerOptions,
): EvaluationsCompletionBridge {
  const bridge: EvaluationsCompletionBridge = {
    activeModel: null,
    activeRowId: null,
    async generateTextCompletionSync(_modelIdentifier, input) {
      if (Array.isArray(input.messages)) {
        throw new Error('unsupported evaluations input shape');
      }
      if (typeof input.prompt !== 'string') {
        throw new Error('evaluations input has no string prompt');
      }
      const model = bridge.activeModel;
      if (model === null) {
        throw new Error('evaluations bridge has no active model');
      }
      const rowId = bridge.activeRowId;
      if (rowId === null) {
        throw new Error('evaluations bridge has no active row');
      }

      const systemText = [input.system_prompt, input.system_instruction].find(
        (value): value is string =>
          typeof value === 'string' && value.trim() !== '',
      );
      const messages: EvalMessage[] = [];
      if (systemText !== undefined) {
        messages.push({ content: systemText, role: 'system' });
      }
      messages.push({ content: input.prompt, role: 'user' });

      try {
        const { provenance, response } = await meteredCall(
          {
            dispatcher: options.dispatcher,
            ledger: options.ledger,
            rowId,
            rubricDigest: sha256Digest(systemText ?? ''),
            rubricVersion: 'evaluations@database-templates',
          },
          {
            maxTokens:
              typeof input.max_tokens === 'number' &&
              Number.isInteger(input.max_tokens) &&
              input.max_tokens > 0
                ? input.max_tokens
                : 1024,
            messages,
            model,
            role: 'judge',
            schema: evaluationsJudgeResponseSchema,
            schemaName: EVALUATIONS_JUDGE_SCHEMA_NAME,
            seed: options.seed,
            temperature:
              typeof input.temperature === 'number' &&
              Number.isFinite(input.temperature)
                ? input.temperature
                : 0.1,
          },
        );
        bridge.lastCallId = provenance.callId;
        return JSON.stringify(response.value);
      } catch (error: unknown) {
        if (error instanceof MeteredCallError) {
          bridge.lastCallId = error.provenance.callId;
        }
        if (error instanceof SpendCapExceededError) {
          bridge.lastFatal = error;
        }
        throw error;
      }
    },
    lastCallId: null,
    lastFatal: null,
    reset() {
      bridge.lastCallId = null;
      bridge.lastFatal = null;
    },
  };
  return bridge;
}

export async function createLiveEvaluationsScorer(
  options: EvaluationsScorerOptions,
): Promise<EvaluationsScorerPort> {
  const bridge = createEvaluationsCompletionBridge(options);
  const dynamicModule: DynamicModule = {
    module: CalibrationEvaluationsModule,
    imports: [
      ConfigModule,
      LoggerModule,
      PrismaModule,
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          connection: buildBullMQConnection(
            parseRedisConnectionForWorkload(configService, RedisWorkload.QUEUE),
          ),
        }),
      }),
      PlatformSettingsModule,
      PromptBuilderModule,
    ],
    providers: [
      EvaluationsOperationsService,
      { provide: ReplicateService, useValue: bridge },
      { provide: ModelsService, useValue: {} },
      { provide: FilesClientService, useValue: {} },
      { provide: MediaUrlService, useValue: {} },
    ],
  };
  const app = await NestFactory.createApplicationContext(dynamicModule, {
    logger: ['error', 'warn'],
  });
  const service = app.get(EvaluationsOperationsService);

  return {
    async close() {
      await app.close();
    },
    async score({ model, output, row }): Promise<ArmCallResult> {
      bridge.reset();
      bridge.activeModel = model;
      bridge.activeRowId = row.id;
      try {
        const result =
          row.contentKind === 'article'
            ? await service.evaluateArticle(output, {}, '')
            : await service.evaluatePost(output, {}, '');
        if (bridge.lastFatal !== null) {
          throw bridge.lastFatal;
        }
        const parsed = evaluationsResultSchema.safeParse(result);
        if (!parsed.success) {
          return {
            brandScore: null,
            callId: bridge.lastCallId,
            failure: 'evaluations result did not match evaluationsResultSchema',
            nativeScore: null,
          };
        }
        return {
          brandScore: parsed.data.scores.brand?.overall ?? null,
          callId: bridge.lastCallId,
          failure: null,
          nativeScore: parsed.data.overallScore,
        };
      } catch (error: unknown) {
        if (bridge.lastFatal !== null) {
          throw bridge.lastFatal;
        }
        if (error instanceof SpendCapExceededError) {
          throw error;
        }
        return {
          brandScore: null,
          callId: bridge.lastCallId,
          failure: error instanceof Error ? error.message : String(error),
          nativeScore: null,
        };
      }
    },
  };
}
