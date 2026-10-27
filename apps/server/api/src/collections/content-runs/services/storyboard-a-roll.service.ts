import { randomUUID } from 'node:crypto';
import {
  matchStoryboardARollChunks,
  planStoryboardARollChunks,
  type StoryboardARollMatch,
  type StoryboardARollPresenter,
  storyboardARollPresenter,
} from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import { StoryboardAnimaticVoiceService } from '@api/collections/content-runs/services/storyboard-animatic-voice.service';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { AvatarVideoGenerationParams } from '@api/collections/videos/services/avatar-video-generation.types';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  quoteStoryboardARollSchema,
  renderStoryboardARollSchema,
  STORYBOARD_A_ROLL_MODEL_KEY,
  type StoryboardARollChunk,
  type StoryboardARollQuote,
  type StoryboardPresenterTrack,
  storyboardARollQuoteSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ZodType } from 'zod';

const MUTATION_ATTEMPTS = 5;
/** A chunk that left no placeholder for this long never reached HeyGen. */
export const A_ROLL_ABANDONED_MS = 5 * 60_000;

const TRACKS: readonly StoryboardPresenterTrack[] = ['aRoll', 'animatic'];

interface ChunkPrice {
  billingMode: StoryboardARollQuote['billingMode'];
  credits: number;
  estimatedSeconds: number | null;
  modelKey: string;
}

type ChunkOutcome = Pick<
  StoryboardARollChunk,
  'state' | 'assetId' | 'durationSeconds' | 'errorCode'
>;

function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  return parsed.data;
}

export function isLiveARollChunk(chunk: StoryboardARollChunk): boolean {
  return chunk.state === 'pending' || chunk.state === 'submitted';
}

/**
 * Renders the long-form presenter track (#8222): the approved narration is
 * split into HeyGen Avatar IV renders at sentence boundaries, played back to
 * back. Each chunk is its own avatar generation with its own credit hold, so
 * a failed chunk is rendered again alone and the others are never charged
 * twice. The B-roll overlay covers the joins.
 *
 * The animatic (#8232) runs the same chunks through speech only, before or
 * after approval, so the creator hears the edit before paying for avatars.
 */
@Injectable()
export class StoryboardARollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly avatars: AvatarVideoGenerationService,
    private readonly voice: StoryboardAnimaticVoiceService,
    private readonly logger: LoggerService,
  ) {}

  async quote(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardARollQuote> {
    const input = parseInput(quoteStoryboardARollSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    return (
      await this.buildQuote(track, organizationId, brandId, userId, config)
    ).quote;
  }

  async render(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(renderStoryboardARollSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const { quote, matches } = await this.buildQuote(
      track,
      organizationId,
      brandId,
      userId,
      config,
    );
    if (quote.inputHash !== input.inputHash)
      throw new ConflictException(
        'The narration or the render price changed. Review the new quote.',
      );
    const presenter = storyboardARollPresenter(config.plan);
    const now = new Date().toISOString();
    const prices = new Map(quote.items.map((item) => [item.ordinal, item]));
    const chunks: StoryboardARollChunk[] = matches.map(
      ({ input: planned, previous }, index) => {
        const ordinal = index + 1;
        if (previous) return { ...previous, ordinal };
        return {
          id: randomUUID(),
          ordinal,
          pieces: planned.pieces,
          text: planned.text,
          fingerprint: planned.fingerprint,
          estimatedSeconds:
            prices.get(ordinal)?.estimatedSeconds ?? planned.estimatedSeconds,
          state: 'pending',
          actorUserId: userId,
          credits: prices.get(ordinal)?.credits ?? 0,
          billingMode: quote.billingMode,
          createdAt: now,
          updatedAt: now,
        };
      },
    );
    const queued = chunks.filter((chunk) => chunk.state === 'pending');
    await this.mutate(organizationId, brandId, runId, (current) => {
      // The quote was bound to this exact revision and narration.
      if (current.revision !== quote.revision)
        throw new ConflictException(
          'The storyboard changed. Review the new quote.',
        );
      if (current[track]?.chunks.some(isLiveARollChunk))
        throw new ConflictException(
          'The presenter track is already rendering.',
        );
      return storyboardStoredRunConfigSchema.parse({
        ...current,
        [track]: {
          presenterId: presenter.presenterId,
          modelKey: quote.modelKey,
          chunks,
        },
      });
    });
    // One at a time: each dispatch records its placeholder in the same run
    // document, so parallel writers would only contend.
    for (const chunk of queued)
      await this.dispatch(track, organizationId, brandId, runId, config, chunk);
    return this.reconcile(organizationId, brandId, runId);
  }

  /**
   * Records finished chunks with their measured length. Billing is settled by
   * the avatar pipeline itself when HeyGen reports the clip. Safe to call
   * repeatedly; clients poll it while a chunk is rendering.
   */
  async reconcile(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRun> {
    const { config, record } = await this.store.read(
      organizationId,
      brandId,
      runId,
    );
    const live = TRACKS.flatMap((track) =>
      (config[track]?.chunks ?? []).filter(isLiveARollChunk),
    );
    const outcomes = new Map<string, ChunkOutcome>();
    for (const chunk of live) {
      const outcome = await this.observe(organizationId, brandId, chunk);
      if (outcome) outcomes.set(chunk.id, outcome);
    }
    if (!outcomes.size) return projectStoryboardRun(record);
    return this.mutate(organizationId, brandId, runId, (current) =>
      this.applyOutcomes(current, outcomes),
    );
  }

  private async buildQuote(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    userId: string,
    config: StoryboardStoredRunConfig,
  ): Promise<{ quote: StoryboardARollQuote; matches: StoryboardARollMatch[] }> {
    const { plan } = config;
    if (!plan.longForm)
      throw new ConflictException(
        'Only a long-form storyboard has a presenter track.',
      );
    if (
      track === 'aRoll' &&
      (config.state !== 'approved' ||
        config.approvedRevision !== config.revision)
    )
      throw new ConflictException(
        'Approve the storyboard before rendering the presenter.',
      );
    if (
      track === 'animatic' &&
      !['storyboard', 'approved'].includes(config.state)
    )
      throw new ConflictException(
        'An animatic is drafted only for a draft or approved storyboard.',
      );
    const presenter = storyboardARollPresenter(plan);
    const price = await this.pricer(
      track,
      organizationId,
      brandId,
      userId,
      config,
    );
    const matches = matchStoryboardARollChunks(
      planStoryboardARollChunks(plan),
      config[track]?.chunks,
    );
    if (matches.some(({ previous }) => previous && isLiveARollChunk(previous)))
      throw new ConflictException('The presenter track is already rendering.');
    const items: StoryboardARollQuote['items'] = [];
    let billingMode: StoryboardARollQuote['billingMode'] | undefined;
    let modelKey: string | undefined;
    for (const [index, { input, previous }] of matches.entries()) {
      if (previous) continue;
      const chunkPrice = await price(input.text, presenter);
      if (billingMode && billingMode !== chunkPrice.billingMode)
        throw new ConflictException(
          'The avatar billing changed while quoting. Try again.',
        );
      billingMode = chunkPrice.billingMode;
      modelKey = chunkPrice.modelKey;
      items.push({
        ordinal: index + 1,
        characters: input.text.length,
        estimatedSeconds: chunkPrice.estimatedSeconds ?? input.estimatedSeconds,
        credits: chunkPrice.credits,
      });
    }
    if (!items.length || !billingMode || !modelKey)
      throw new BadRequestException('The presenter track is already rendered.');
    const readyChunkIds = matches.flatMap(({ previous }) =>
      previous ? [previous.id] : [],
    );
    const quote = storyboardARollQuoteSchema.parse({
      revision: config.revision,
      modelKey,
      billingMode,
      inputHash: storyboardConfigHash({
        revision: config.revision,
        modelKey,
        billingMode,
        readyChunkIds,
        chunks: matches.map(({ input }, index) => ({
          fingerprint: input.fingerprint,
          credits: items.find((item) => item.ordinal === index + 1)?.credits,
        })),
      }),
      items,
      readyChunkIds,
      total: items.reduce((sum, item) => sum + item.credits, 0),
    });
    return { quote, matches };
  }

  /**
   * Prices the parts of a track still to render for the whole-video
   * estimate (#8221), before approval: parts already rendered or rendering
   * are free, failed ones are priced again.
   */
  async estimate(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    userId: string,
    config: StoryboardStoredRunConfig,
  ): Promise<{
    parts: number;
    credits: number;
    seconds: number;
    billingMode?: StoryboardARollQuote['billingMode'];
  }> {
    const pending = matchStoryboardARollChunks(
      planStoryboardARollChunks(config.plan),
      config[track]?.chunks,
    ).filter(({ previous }) => !previous);
    if (!pending.length) return { parts: 0, credits: 0, seconds: 0 };
    const presenter = storyboardARollPresenter(config.plan);
    const price = await this.pricer(
      track,
      organizationId,
      brandId,
      userId,
      config,
    );
    let credits = 0;
    let seconds = 0;
    let billingMode: StoryboardARollQuote['billingMode'] | undefined;
    for (const { input } of pending) {
      const chunkPrice = await price(input.text, presenter);
      credits += chunkPrice.credits;
      seconds += chunkPrice.estimatedSeconds ?? input.estimatedSeconds;
      billingMode = chunkPrice.billingMode;
    }
    return { parts: pending.length, credits, seconds, billingMode };
  }

  /** Prices one chunk of the track. */
  private async pricer(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    userId: string,
    config: StoryboardStoredRunConfig,
  ): Promise<
    (text: string, presenter: StoryboardARollPresenter) => Promise<ChunkPrice>
  > {
    if (track === 'aRoll')
      return (text, presenter) =>
        this.avatars.quote(
          this.chunkParams(text, presenter, config.plan.format),
          { organizationId, userId, brandId },
        );
    const voice = await this.voice.resolve(
      organizationId,
      storyboardARollPresenter(config.plan),
    );
    return (text) => this.voice.quote(organizationId, voice, text);
  }

  private chunkParams(
    text: string,
    presenter: StoryboardARollPresenter,
    format: StoryboardStoredRunConfig['plan']['format'],
  ): AvatarVideoGenerationParams {
    return {
      text,
      photoIngredientId: presenter.avatarAssetId,
      clonedVoiceId: presenter.voiceId,
      aspectRatio: format,
      model: STORYBOARD_A_ROLL_MODEL_KEY,
    };
  }

  private async dispatch(
    track: StoryboardPresenterTrack,
    organizationId: string,
    brandId: string,
    runId: string,
    config: StoryboardStoredRunConfig,
    chunk: StoryboardARollChunk,
  ): Promise<void> {
    let assetId: string | undefined;
    try {
      if (track === 'animatic') {
        assetId = await this.voice.speak({
          organizationId,
          brandId,
          userId: chunk.actorUserId,
          voice: await this.voice.resolve(
            organizationId,
            storyboardARollPresenter(config.plan),
          ),
          text: chunk.text,
          sourceActionId: `storyboard-animatic-${runId}-${chunk.id}`,
        });
        await this.patch(organizationId, brandId, runId, chunk.id, {
          assetId,
          state: 'submitted',
        });
        return;
      }
      await this.avatars.generateAvatarVideo(
        this.chunkParams(
          chunk.text,
          storyboardARollPresenter(config.plan),
          config.plan.format,
        ),
        { organizationId, userId: chunk.actorUserId, brandId },
        async (ingredientId) => {
          assetId = ingredientId;
          await this.patch(organizationId, brandId, runId, chunk.id, {
            assetId: ingredientId,
            state: 'submitted',
          });
        },
        {
          groupId: `storyboard-a-roll-${runId}`,
          groupIndex: chunk.ordinal - 1,
        },
      );
    } catch (error: unknown) {
      // The avatar pipeline already released the hold of a render HeyGen
      // never accepted and failed its placeholder.
      this.logger.error('Storyboard A-roll chunk dispatch failed', error, {
        organizationId,
        brandId,
        runId,
        chunkId: chunk.id,
        hasPlaceholder: Boolean(assetId),
      });
      Sentry.captureException(error, {
        extra: { organizationId, brandId, runId, chunkId: chunk.id, assetId },
        tags: {
          operation: 'storyboard-a-roll',
          errorCode: 'STORYBOARD_A_ROLL_DISPATCH_FAILED',
        },
      });
      await this.patch(organizationId, brandId, runId, chunk.id, {
        state: 'failed',
        errorCode: 'STORYBOARD_A_ROLL_DISPATCH_FAILED',
      });
    }
  }

  private async observe(
    organizationId: string,
    brandId: string,
    chunk: StoryboardARollChunk,
  ): Promise<ChunkOutcome | undefined> {
    if (!chunk.assetId) {
      const isAbandoned =
        Date.now() - Date.parse(chunk.updatedAt) > A_ROLL_ABANDONED_MS;
      return isAbandoned
        ? { state: 'failed', errorCode: 'STORYBOARD_A_ROLL_NOT_DISPATCHED' }
        : undefined;
    }
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, { brandId, id: chunk.assetId }),
      select: { status: true, metadata: { select: { duration: true } } },
    });
    const status = asset?.status ?? 'FAILED';
    if (status === 'GENERATED' || status === 'VALIDATED') {
      const duration = asset?.metadata?.duration;
      return {
        state: 'ready',
        assetId: chunk.assetId,
        ...(typeof duration === 'number' && duration > 0
          ? { durationSeconds: duration }
          : {}),
      };
    }
    if (status !== 'FAILED') return undefined;
    return {
      state: 'failed',
      assetId: chunk.assetId,
      errorCode: 'STORYBOARD_A_ROLL_RENDER_FAILED',
    };
  }

  private applyOutcomes(
    current: StoryboardStoredRunConfig,
    outcomes: ReadonlyMap<string, ChunkOutcome>,
  ): StoryboardStoredRunConfig {
    const updatedAt = new Date().toISOString();
    return storyboardStoredRunConfigSchema.parse(
      this.mapChunks(current, (chunk) => {
        const outcome = outcomes.get(chunk.id);
        return outcome && isLiveARollChunk(chunk)
          ? { ...chunk, ...outcome, updatedAt }
          : chunk;
      }),
    );
  }

  /** Applies `change` to every chunk of both presenter tracks. */
  private mapChunks(
    current: StoryboardStoredRunConfig,
    change: (chunk: StoryboardARollChunk) => StoryboardARollChunk,
  ): StoryboardStoredRunConfig {
    const next = { ...current };
    for (const track of TRACKS) {
      const value = current[track];
      if (value) next[track] = { ...value, chunks: value.chunks.map(change) };
    }
    return next;
  }

  private async patch(
    organizationId: string,
    brandId: string,
    runId: string,
    chunkId: string,
    patch: Partial<
      Pick<StoryboardARollChunk, 'assetId' | 'state' | 'errorCode'>
    >,
  ) {
    await this.mutate(organizationId, brandId, runId, (current) =>
      this.mapChunks(current, (chunk) =>
        chunk.id === chunkId && isLiveARollChunk(chunk)
          ? { ...chunk, ...patch, updatedAt: new Date().toISOString() }
          : chunk,
      ),
    );
  }

  /** Compare-and-set on the whole run document, retried on concurrent writes. */
  private async mutate(
    organizationId: string,
    brandId: string,
    runId: string,
    change: (config: StoryboardStoredRunConfig) => StoryboardStoredRunConfig,
  ): Promise<StoryboardRun> {
    for (let attempt = 0; attempt < MUTATION_ATTEMPTS; attempt++) {
      const { config } = await this.store.read(organizationId, brandId, runId);
      const next = change(config);
      try {
        return await this.store.save(
          organizationId,
          brandId,
          runId,
          config,
          next,
        );
      } catch (error: unknown) {
        if (
          !(error instanceof ConflictException) ||
          attempt === MUTATION_ATTEMPTS - 1
        )
          throw error;
      }
    }
    throw new ConflictException('The storyboard is busy. Retry shortly.');
  }
}
