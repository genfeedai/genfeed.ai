import type {
  ArticleHarnessContext,
  TextGenerationCharge,
} from '@api/collections/articles/services/articles-content.types';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { appendHarnessBriefToPrompt } from '@api/services/harness/harness-brief.util';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ModelCategory, SystemPromptKey } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, Optional } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

@Injectable()
export class ArticleTextGenerationService {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly modelsService?: ModelsService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
  ) {}

  /**
   * Shared generation prologue for the article generators.
   *
   * Appends the harness brief to `basePrompt`, builds the model input via the
   * PromptBuilderService (merging the harness brand context), runs the Replicate
   * text completion, and — when an `onBilling` callback is supplied — meters the
   * charge. Returns the raw model response for the caller to parse. The differing
   * pieces (model, prompt-builder options, failure message, whether the step is
   * billed) are passed in so generateArticles/generateLongFormArticle/enhance can
   * share one body without changing their individual behaviour.
   */
  async runTextGenerationStep(params: {
    model: string;
    basePrompt: string;
    harnessContext: ArticleHarnessContext;
    buildPromptOptions: Omit<
      PromptBuilderParams,
      'prompt' | 'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
    >;
    organizationId: string;
    failureMessage: string;
    onBilling?: (charge: TextGenerationCharge) => void;
  }): Promise<string> {
    const promptWithHarness = appendHarnessBriefToPrompt(
      params.basePrompt,
      params.harnessContext.brief,
    );

    if (!this.promptBuilderService) {
      throw new Error('Prompt builder service not available');
    }

    const { input } = await this.promptBuilderService.buildPrompt(
      params.model,
      {
        ...params.buildPromptOptions,
        prompt: promptWithHarness,
        ...params.harnessContext.promptBuilder,
      },
      params.organizationId,
    );

    const responseText =
      await this.replicateService?.generateTextCompletionSync(
        params.model,
        input,
      );

    if (!responseText) {
      throw new Error(params.failureMessage);
    }

    if (params.onBilling) {
      params.onBilling(
        await this.calculateTextGenerationCharge(
          params.model,
          input,
          responseText,
        ),
      );
    }

    return responseText;
  }

  async generateTextWithModel(
    model: string,
    prompt: string,
    organizationId: string,
    promptBuilderContext?: Pick<
      PromptBuilderParams,
      'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
    >,
  ): Promise<{ output: string; charge: TextGenerationCharge }> {
    const { input } = (await this.promptBuilderService?.buildPrompt(
      model as string,
      {
        maxTokens: this.configService.get('MAX_TOKENS'),
        modelCategory: ModelCategory.TEXT,
        prompt,
        systemPromptTemplate: SystemPromptKey.ARTICLE,
        temperature: 0.7,
        useTemplate: false,
        ...promptBuilderContext,
      },
      organizationId,
    )) || { input: {} };

    const output = await this.replicateService?.generateTextCompletionSync(
      model,
      input,
    );

    if (!output) {
      throw new Error(`Failed to generate text with model: ${model}`);
    }

    return {
      charge: await this.calculateTextGenerationCharge(model, input, output),
      output,
    };
  }

  private async calculateTextGenerationCharge(
    modelKey: string,
    input: unknown,
    output: string,
  ): Promise<TextGenerationCharge> {
    if (!this.modelsService) {
      throw new Error('ModelsService not available');
    }

    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(modelKey),
    });

    if (!model) {
      throw new Error(`Model pricing is not configured for ${modelKey}`);
    }

    const inputTokens = this.estimateTokens(input);
    const outputTokens = this.estimateTokens(output);

    const amount =
      model.pricingType === 'per-token'
        ? Math.max(
            Math.ceil(
              (inputTokens * Number(model.inputCostPerMillionTokens || 0) +
                outputTokens * Number(model.outputCostPerMillionTokens || 0)) /
                1_000_000,
            ),
            getMinimumTextCredits(model),
          )
        : model.cost || 0;

    return {
      amount,
      inputTokens,
      modelKey,
      outputTokens,
    };
  }

  private estimateTokens(value: unknown): number {
    const text = this.extractBillableText(value).trim();

    if (!text) {
      return 0;
    }

    return Math.ceil(text.length / 4);
  }

  private extractBillableText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.extractBillableText(item)).join(' ');
    }

    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map((item) => this.extractBillableText(item))
        .join(' ');
    }

    return '';
  }
}
