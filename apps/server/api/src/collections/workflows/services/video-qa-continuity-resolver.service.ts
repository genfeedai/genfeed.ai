import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  VideoContinuityClipFinding,
  VideoContinuityDimensionFinding,
  VideoContinuityVerdict,
} from '@genfeedai/contracts/interfaces';
import { createNotAssessedContinuityDimension } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const VISION_FEATURES = new Set([
  'image-input',
  'image_input',
  'multimodal',
  'vision',
]);
const KNOWN_VISION_MODEL_PREFIXES = [
  'anthropic/',
  'google/',
  'moonshotai/',
  'openai/',
  'x-ai/',
];

type ContinuityInput = {
  characterReferenceUrls: string[];
  contactSheetUrl: string;
  organizationId: string;
  productReferenceUrls: string[];
  runId: string;
  videoUrl: string;
};

@Injectable()
export class VideoQaContinuityResolverService {
  constructor(
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(input: ContinuityInput): Promise<{
    finding?: VideoContinuityClipFinding;
    modelKey?: string;
    skipReason?: 'vision_model_unavailable';
  }> {
    const modelKey = await this.resolveVisionModel(input.organizationId);
    if (!modelKey) {
      return { skipReason: 'vision_model_unavailable' };
    }
    const response = await this.llmDispatcher.chatCompletion(
      {
        max_tokens: 650,
        messages: [
          {
            content:
              'You are a visual continuity QA evaluator. Return strict JSON only. Never recommend rejection or regeneration.',
            role: 'system',
          },
          {
            content: this.buildVisionContent(input),
            role: 'user',
          },
        ],
        model: modelKey,
        temperature: 0,
      },
      input.organizationId,
    );
    return {
      finding: this.parseFinding(
        response.choices?.[0]?.message?.content,
        input,
      ),
      modelKey,
    };
  }

  private async resolveVisionModel(
    organizationId: string,
  ): Promise<string | undefined> {
    const [settings, models] = await Promise.all([
      this.prisma.organizationSetting.findUnique({
        select: { defaultModel: true, enabledModelIds: true },
        where: { organizationId },
      }),
      this.prisma.model.findMany({
        orderBy: [{ cost: 'asc' }, { key: 'asc' }],
        select: {
          capabilities: true,
          description: true,
          id: true,
          key: true,
          recommendedFor: true,
          supportsFeatures: true,
        },
        where: {
          category: 'text',
          isActive: true,
          isDeleted: false,
          isLegacy: false,
          OR: [{ organizationId: null }, { organizationId }],
        },
      }),
    ]);
    const enabled = new Set(settings?.enabledModelIds ?? []);
    if (settings?.defaultModel) {
      enabled.add(settings.defaultModel);
    }
    if (enabled.size === 0) {
      return undefined;
    }
    const candidates = models.filter(
      (model) =>
        this.supportsVision(model) &&
        (enabled.has(model.id) || enabled.has(model.key)),
    );
    return (
      candidates.find((model) => model.key === settings?.defaultModel)?.key ??
      candidates[0]?.key
    );
  }

  private buildVisionContent(input: ContinuityInput): Array<{
    image_url?: { url: string };
    text?: string;
    type: string;
  }> {
    return [
      {
        text: [
          'Compare the first image (generated clip contact sheet) with the canonical reference images that follow.',
          `Character references: ${input.characterReferenceUrls.length}. Product references: ${input.productReferenceUrls.length}.`,
          'Return {"character":{"verdict":"consistent|drift|uncertain|not_assessed","confidence":0..1|null,"summary":"..."},"outfit":{...},"product":{...}}.',
          'Outfit is assessed relative to character references. Use not_assessed when the dimension or reference is absent.',
        ].join('\n'),
        type: 'text',
      },
      { image_url: { url: input.contactSheetUrl }, type: 'image_url' },
      ...input.characterReferenceUrls.map((url) => ({
        image_url: { url },
        type: 'image_url',
      })),
      ...input.productReferenceUrls.map((url) => ({
        image_url: { url },
        type: 'image_url',
      })),
    ];
  }

  private parseFinding(
    raw: string | null | undefined,
    input: ContinuityInput,
  ): VideoContinuityClipFinding {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(
        (raw ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
      ) as Record<string, unknown>;
    } catch {
      const message = 'Vision model returned an invalid structured response.';
      const unavailable = createNotAssessedContinuityDimension(message);
      return {
        character: unavailable,
        clipId: input.videoUrl,
        clipIndex: 0,
        errors: [{ code: 'MODEL_RESPONSE_INVALID', message }],
        evidenceFrames: [{ kind: 'contact_sheet', url: input.contactSheetUrl }],
        outfit: unavailable,
        product: unavailable,
        videoUrl: input.videoUrl,
      };
    }
    return {
      character: this.parseDimension(parsed.character),
      clipId: input.videoUrl,
      clipIndex: 0,
      errors: [],
      evidenceFrames: [{ kind: 'contact_sheet', url: input.contactSheetUrl }],
      outfit: this.parseDimension(parsed.outfit),
      product: this.parseDimension(parsed.product),
      videoUrl: input.videoUrl,
    };
  }

  private parseDimension(value: unknown): VideoContinuityDimensionFinding {
    const record = this.readRecord(value);
    const verdicts: VideoContinuityVerdict[] = [
      'consistent',
      'drift',
      'uncertain',
      'not_assessed',
    ];
    const verdict = verdicts.includes(record.verdict as VideoContinuityVerdict)
      ? (record.verdict as VideoContinuityVerdict)
      : 'uncertain';
    const confidence =
      typeof record.confidence === 'number' &&
      Number.isFinite(record.confidence)
        ? Math.min(1, Math.max(0, record.confidence))
        : null;
    return {
      confidence,
      summary:
        typeof record.summary === 'string'
          ? record.summary
          : 'No explanation was returned.',
      verdict,
    };
  }

  private supportsVision(model: {
    capabilities: string[];
    description: string | null;
    key: string;
    recommendedFor: string[];
    supportsFeatures: string[];
  }): boolean {
    const features = [
      ...model.capabilities,
      ...model.recommendedFor,
      ...model.supportsFeatures,
    ].map((feature) => feature.toLowerCase());
    return (
      features.some((feature) => VISION_FEATURES.has(feature)) ||
      /\b(multimodal|vision)\b/i.test(model.description ?? '') ||
      KNOWN_VISION_MODEL_PREFIXES.some((prefix) => model.key.startsWith(prefix))
    );
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
