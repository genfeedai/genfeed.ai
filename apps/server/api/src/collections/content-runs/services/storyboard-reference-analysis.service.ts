import { storyboardMaxShots } from '@api/collections/content-runs/services/storyboard-plan-draft';
import {
  buildReferenceVideoSystemPrompt,
  REFERENCE_IMAGE_SYSTEM_PROMPT,
  referenceRuntimeBudgetSeconds,
} from '@api/collections/content-runs/services/storyboard-reference-plan';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { OpenRouterMessageContentPart } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { MediaPerceptionFrame } from '@genfeedai/contracts/api-types/contracts/media-perception.contract';
import {
  REFERENCE_ANALYSIS_LIMITS,
  type ReferenceImageAnalysis,
  type ReferenceVideoAnalysis,
  referenceImageAnalysisSchema,
  referenceVideoAnalysisSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-reference-analysis.contract';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { IMediaPerception } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const RETRYABLE_MESSAGE =
  'The reference could not be analysed. Nothing was changed; try again.';
/** Frames sampled from a video that has no stored perception frames. */
const SAMPLED_FRAME_COUNT = 8;
const FRAME_WIDTH_PIXELS = 512;
/** Transcript text sent to the model; the rest adds cost, not signal. */
const MAX_TRANSCRIPT_CHARACTERS = 4_000;
const MAX_OUTPUT_TOKENS = 8_192;

export interface ReferenceAnalysisRequest {
  assetId: string;
  brandId: string;
  organizationId: string;
  /** The plan's runtime, or null while it has none. */
  planBudgetSeconds: number | null;
  /** What the plan's video model renders, in seconds. */
  supportedDurationsSeconds: readonly number[];
}

export type ReferenceAnalysis =
  | {
      analysis: ReferenceVideoAnalysis;
      kind: 'video';
      /** The reference's own length, or the plan's when that is longer. */
      runtimeBudgetSeconds: number;
    }
  | { analysis: ReferenceImageAnalysis; kind: 'image' };

interface ReferenceSource {
  durationSeconds: number | null;
  kind: 'image' | 'video';
  url: string;
}

interface ReferenceFrame {
  timestampSeconds: number | null;
  url: string;
}

/**
 * Reverses a Library video or image into the shot fields of the Storyboard
 * plan (#10578). It reads the stored perception artefacts (frames, on-screen
 * text, transcript, description) when the asset has them instead of extracting
 * them again, asks a vision model for a schema-checked answer and returns it;
 * mapping the answer into plan shots is `storyboard-reference-plan.ts`.
 * Spend is recorded by the dispatcher in the LLM vendor-cost ledger.
 */
@Traced()
@Injectable()
export class StoryboardReferenceAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrls: MediaUrlService,
    private readonly files: FilesClientService,
    private readonly perception: MediaPerceptionService,
    private readonly llm: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  async analyse(request: ReferenceAnalysisRequest): Promise<ReferenceAnalysis> {
    const source = await this.resolveSource(request);
    try {
      const stored = await this.perception.getForAsset(
        request.organizationId,
        request.assetId,
      );
      const frames = await this.collectFrames(request, source, stored);
      const content = this.buildContent(source, frames, stored);
      const callContext = { brandId: request.brandId };
      const runtimeBudgetSeconds = referenceRuntimeBudgetSeconds(
        request.planBudgetSeconds,
        source.durationSeconds ?? 0,
      );
      if (source.kind === 'image')
        return {
          kind: 'image',
          analysis: await this.llm.completeStructured(
            {
              max_tokens: MAX_OUTPUT_TOKENS,
              messages: [
                { content: REFERENCE_IMAGE_SYSTEM_PROMPT, role: 'system' },
                { content, role: 'user' },
              ],
              model: LLM_DEFAULTS.background,
              schema: referenceImageAnalysisSchema,
              schemaName: 'storyboard_reference_image_analysis',
              temperature: 0,
            },
            request.organizationId,
            callContext,
          ),
        };
      return {
        kind: 'video',
        runtimeBudgetSeconds,
        analysis: await this.llm.completeStructured(
          {
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [
              {
                content: buildReferenceVideoSystemPrompt({
                  maxShots: storyboardMaxShots(
                    request.supportedDurationsSeconds,
                    runtimeBudgetSeconds,
                  ),
                  runtimeBudgetSeconds,
                }),
                role: 'system',
              },
              { content, role: 'user' },
            ],
            model: LLM_DEFAULTS.background,
            schema: referenceVideoAnalysisSchema,
            schemaName: 'storyboard_reference_video_analysis',
            temperature: 0,
          },
          request.organizationId,
          callContext,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Storyboard reference analysis failed', error, {
        assetId: request.assetId,
        brandId: request.brandId,
      });
      throw new ServiceUnavailableException(RETRYABLE_MESSAGE);
    }
  }

  /** A video or image of this brand's Library, with a length the analysis reads. */
  private async resolveSource(
    request: ReferenceAnalysisRequest,
  ): Promise<ReferenceSource> {
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(request.organizationId, {
        brandId: request.brandId,
        id: request.assetId,
        category: { in: ['VIDEO' as const, 'IMAGE' as const] },
        scope: 'USER' as const,
        status: {
          in: ['UPLOADED' as const, 'GENERATED' as const, 'VALIDATED' as const],
        },
      }),
    });
    if (!asset || asset.sourceActionId?.startsWith('remix-source:'))
      throw new NotFoundException('Storyboard reference', request.assetId);
    const url =
      readIngredientMediaUrl(asset) ??
      (asset.s3Key ? this.mediaUrls.buildUrl(asset.s3Key) : undefined);
    if (!url)
      throw new ConflictException('The reference has no accessible media.');
    if (asset.category === 'IMAGE')
      return { kind: 'image', url, durationSeconds: null };
    const probe = await this.files.probeMediaFromUrl(url, 'video');
    if (
      !probe.durationSeconds ||
      probe.durationSeconds > REFERENCE_ANALYSIS_LIMITS.maxVideoSeconds ||
      !probe.sizeBytes ||
      probe.sizeBytes > REFERENCE_ANALYSIS_LIMITS.maxVideoBytes
    )
      throw new BadRequestException(
        'A reference video must be at most 60 seconds and 100 MiB, with a known duration and size.',
      );
    return { kind: 'video', url, durationSeconds: probe.durationSeconds };
  }

  /**
   * The frames the model looks at. A video that was perceived already has its
   * frames stored; one that was not is sampled evenly, as scene analysis does.
   */
  private async collectFrames(
    request: ReferenceAnalysisRequest,
    source: ReferenceSource,
    stored: IMediaPerception | null,
  ): Promise<ReferenceFrame[]> {
    if (source.kind === 'image')
      return [{ timestampSeconds: null, url: source.url }];
    const durationSeconds = source.durationSeconds ?? 0;
    if (stored?.framesStatus === 'ready' && stored.frames.length > 0)
      return stored.frames.map(({ timestampSeconds, url }) => ({
        timestampSeconds,
        url,
      }));
    return Promise.all(
      Array.from({ length: SAMPLED_FRAME_COUNT }, async (_, index) => {
        const timestampSeconds =
          Math.round(
            ((durationSeconds * (index + 0.5)) / SAMPLED_FRAME_COUNT) * 100,
          ) / 100;
        const thumbnail = await this.files.generateThumbnail(
          source.url,
          `reverse-${request.assetId}-${index}`,
          timestampSeconds,
          FRAME_WIDTH_PIXELS,
        );
        const url = (thumbnail as { thumbnailUrl?: unknown })?.thumbnailUrl;
        if (typeof url !== 'string' || url.length === 0)
          throw new ConflictException('A reference frame could not be read.');
        return { timestampSeconds, url };
      }),
    );
  }

  private buildContent(
    source: ReferenceSource,
    frames: readonly ReferenceFrame[],
    stored: IMediaPerception | null,
  ): OpenRouterMessageContentPart[] {
    const storedFrames: readonly MediaPerceptionFrame[] = stored?.frames ?? [];
    const times = new Map(
      storedFrames.map((frame) => [frame.index, frame.timestampSeconds]),
    );
    // OCR is keyed by the stored frames, so it only lines up with those.
    const usesStoredFrames = frames.every((frame) =>
      storedFrames.some((stored) => stored.url === frame.url),
    );
    const context = {
      durationSeconds: source.durationSeconds,
      kind: source.kind,
      onScreenText: (stored?.ocrStatus === 'ready' ? stored.ocr : [])
        .filter((entry) => entry.text.length > 0)
        .map((entry) => ({
          atSeconds: usesStoredFrames
            ? (times.get(entry.frameIndex) ?? null)
            : null,
          text: entry.text,
        })),
      summary: stored?.description?.summary ?? null,
      transcript:
        stored?.transcriptStatus === 'ready' && stored.transcript
          ? stored.transcript.text.slice(0, MAX_TRANSCRIPT_CHARACTERS)
          : null,
    };
    const content: OpenRouterMessageContentPart[] = [
      { text: JSON.stringify(context), type: 'text' },
    ];
    for (const frame of frames)
      content.push(
        {
          text:
            frame.timestampSeconds === null
              ? 'The reference image.'
              : `Frame sampled at ${frame.timestampSeconds.toFixed(2)} seconds.`,
          type: 'text',
        },
        { image_url: { url: frame.url }, type: 'image_url' },
      );
    return content;
  }
}
