import { randomUUID } from 'node:crypto';
import {
  ideaDispatchKey,
  ideaPromptText,
  resolveIdeaGenerationParams,
} from '@api/collections/batch-projects/services/batch-project-dispatch.util';
import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ByokProvider, ModelCategory } from '@genfeedai/contracts';
import {
  AVATAR_GENERATION_CREDIT_COST,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type {
  BatchProjectBillingMode,
  FastlaneFormat,
  IBatchProjectQuote,
  IBatchProjectQuoteLine,
} from '@genfeedai/contracts/interfaces';
import type { BatchProjectItem } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

/** A quote stays acceptable this long, as Brand Remix quotes do. */
export const BATCH_PROJECT_QUOTE_TTL_MS = 15 * 60_000;

type PricedModel = {
  billingMode: BatchProjectBillingMode;
  credits: number;
  model: string;
};

/**
 * Prices idea generation before anything runs (#5463). Image and video ideas
 * resolve the model the generation will use and its price through the same
 * estimator the generation services charge with; avatar ideas use the fixed
 * avatar price. A format the organization pays with its own key quotes 0
 * platform credits.
 */
@Injectable()
export class BatchProjectQuoteService {
  constructor(
    private readonly estimate: AgentGenerationEstimateService,
    private readonly models: ModelRegistrationService,
    private readonly byok: ByokService,
  ) {}

  async build(input: {
    items: Array<{ attempt: number; item: BatchProjectItem }>;
    organizationId: string;
    revision: number;
  }): Promise<IBatchProjectQuote> {
    const pricedByFormat = new Map<FastlaneFormat, PricedModel>();
    const items: IBatchProjectQuoteLine[] = [];
    for (const { attempt, item } of input.items) {
      const idea = readBatchProjectIdea(item.idea);
      if (!idea) {
        throw new ConflictException('Only idea items can be quoted.');
      }
      let priced = pricedByFormat.get(idea.format);
      if (!priced) {
        priced = await this.priceFormat(
          input.organizationId,
          idea.format,
          ideaPromptText(idea),
        );
        pricedByFormat.set(idea.format, priced);
      }
      items.push({
        attempt,
        billingMode: priced.billingMode,
        credits: priced.credits,
        format: idea.format,
        itemId: item.id,
        key: ideaDispatchKey(item.id, attempt),
        model: priced.model,
      });
    }

    const now = Date.now();
    return {
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + BATCH_PROJECT_QUOTE_TTL_MS).toISOString(),
      id: randomUUID(),
      items,
      revision: input.revision,
      total: items.reduce((sum, line) => sum + line.credits, 0),
    };
  }

  private async priceFormat(
    organizationId: string,
    format: FastlaneFormat,
    prompt: string,
  ): Promise<PricedModel> {
    if (format === 'avatar') {
      const isByok = await this.byok.isByokActiveForProvider(
        organizationId,
        ByokProvider.HEYGEN,
      );
      return {
        billingMode: isByok ? 'byok' : 'platform',
        credits: isByok ? 0 : AVATAR_GENERATION_CREDIT_COST,
        model: MODEL_KEYS.HEYGEN_AVATAR,
      };
    }

    const { aspectRatio, duration, height, width } =
      resolveIdeaGenerationParams(format);
    const quote = await this.estimate.estimate({
      aspectRatio,
      dimensions: { height, width },
      ...(duration ? { duration } : {}),
      category: format === 'video' ? ModelCategory.VIDEO : ModelCategory.IMAGE,
      organizationId,
      outputs: 1,
      prompt,
    });
    if (!quote.isAvailable || quote.credits === null || !quote.modelKey) {
      throw new ConflictException(
        `No ${format} model with a valid price is available right now.`,
      );
    }
    const model = await this.models.validateModelForOrg(
      quote.modelKey,
      organizationId,
    );
    const provider = resolveModelByokProvider(quote.modelKey, model?.provider);
    const isByok = provider
      ? await this.byok.isByokActiveForProvider(organizationId, provider)
      : false;
    return {
      billingMode: isByok ? 'byok' : 'platform',
      credits: isByok ? 0 : quote.credits,
      model: quote.modelKey,
    };
  }
}
