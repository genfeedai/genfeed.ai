/**
 * Live dispatcher: boots `LlmDispatcherModule` in a Nest application context
 * and sends every call through `LlmDispatcherService.completeStructured`, so
 * provider routing, BYOK resolution, the OpenRouter zero-data-retention
 * policy, completion telemetry and the vendor cost ledger all apply exactly
 * as they do for background scoring. Needs the API environment (provider
 * keys, Redis, database) and built workspace packages
 * (`bunx turbo run build --filter="@genfeedai/api^..."`), exactly like the
 * API in local dev. Imported lazily so stub runs never load the API.
 */

import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  OpenRouterChatCompletionResponse,
  OpenRouterMessage,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
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
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  EvalDispatcher,
  EvalMessage,
  EvalStructuredRequest,
  EvalStructuredResponse,
  EvalUsage,
} from '../contracts';

function toOpenRouterMessage(message: EvalMessage): OpenRouterMessage {
  return { content: message.content, role: message.role };
}

/**
 * OpenRouter names the upstream that served the call; the native Anthropic
 * and OpenAI adapters do not, so those fall back to the route the dispatcher
 * picks from the model prefix.
 */
function servedProvider(
  response: OpenRouterChatCompletionResponse | null,
  model: string,
): string {
  const raw: unknown = response;
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'provider' in raw &&
    typeof raw.provider === 'string' &&
    raw.provider.length > 0
  ) {
    return `openrouter:${raw.provider}`;
  }

  const prefix = model.split('/', 1)[0] ?? model;
  return prefix === 'anthropic' || prefix === 'openai' || prefix === 'local'
    ? prefix
    : 'openrouter';
}

/**
 * The globals `AppModule` gives the dispatcher (config, logger, Prisma for
 * BYOK and the cost ledger, the BullMQ root for cost settlement) and nothing
 * else — no HTTP surface, no schedulers.
 */
@Module({
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
    LlmDispatcherModule,
  ],
})
class ContentEvalLiveModule {}

export async function createLiveDispatcher(): Promise<EvalDispatcher> {
  const app = await NestFactory.createApplicationContext(
    ContentEvalLiveModule,
    {
      logger: ['error', 'warn'],
    },
  );
  const service = app.get(LlmDispatcherService);

  return {
    async close() {
      await app.close();
    },
    async completeStructured<TResult>(
      request: EvalStructuredRequest<TResult>,
    ): Promise<EvalStructuredResponse<TResult>> {
      const startedAt = Date.now();
      const usage: EvalUsage = {
        completionTokens: 0,
        costUsd: 0,
        promptTokens: 0,
      };
      let modelVersion = request.model;
      let provider = servedProvider(null, request.model);

      // The dispatcher has no seed parameter today; the seed is recorded in
      // provenance so a re-run uses the same one once it does.
      const value = await service.completeStructured({
        max_tokens: request.maxTokens,
        messages: request.messages.map(toOpenRouterMessage),
        model: request.model,
        onAttempt: (response) => {
          // A repair retry is a second billed call; sum both.
          usage.promptTokens += response.usage?.prompt_tokens ?? 0;
          usage.completionTokens += response.usage?.completion_tokens ?? 0;
          const cost = response.usage?.cost;
          usage.costUsd =
            usage.costUsd === null || typeof cost !== 'number'
              ? null
              : usage.costUsd + cost;
          modelVersion = response.model ?? modelVersion;
          provider = servedProvider(response, request.model);
        },
        schema: request.schema,
        schemaName: request.schemaName,
        temperature: request.temperature,
      });

      return {
        latencyMs: Date.now() - startedAt,
        modelVersion,
        provider,
        usage,
        value,
      };
    },
    kind: 'live',
  };
}
