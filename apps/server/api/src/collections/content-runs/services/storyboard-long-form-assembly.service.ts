import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { StoryboardPresenterTrack } from '@api/collections/content-runs/services/storyboard-a-roll.service';
import {
  matchStoryboardARollChunks,
  planStoryboardARollChunks,
  storyboardARollPresenter,
} from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import {
  buildLongFormTimeline,
  type LongFormTimeline,
} from '@api/collections/content-runs/services/storyboard-long-form-timeline';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  categoryToPlural,
  EditorProjectStatus,
  EditorTrackType,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type {
  IEditorClip,
  IEditorProjectSettings,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { ConflictException, Injectable } from '@nestjs/common';

export const LONG_FORM_EDIT_FPS = 30;

/** A cutaway may be a still; the presenter is a video, or speech in a draft. */
const FOOTAGE_CATEGORIES = [
  'VIDEO',
  'AVATAR',
  'VIDEO_EDIT',
  'IMAGE',
  'VOICE',
  'AUDIO',
] as const;
const READY_STATUSES = new Set(['GENERATED', 'VALIDATED', 'UPLOADED']);

const SETTINGS: Record<
  StoryboardPlan['format'],
  Pick<IEditorProjectSettings, 'format' | 'width' | 'height'>
> = {
  '16:9': { format: IngredientFormat.LANDSCAPE, width: 1920, height: 1080 },
  '9:16': { format: IngredientFormat.PORTRAIT, width: 1080, height: 1920 },
  '1:1': { format: IngredientFormat.SQUARE, width: 1080, height: 1080 },
};

interface FootageAsset {
  category: string;
  durationSeconds?: number;
}

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function frames(seconds: number): number {
  return Math.round(seconds * LONG_FORM_EDIT_FPS);
}

/**
 * Builds the long-form edit (#8224): the presenter renders back to back on
 * the A-roll track and the cutaways on a B-roll track above it, opened as an
 * Editor project the creator or the agent finishes and exports.
 */
@Injectable()
export class StoryboardLongFormAssemblyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly editorProjects: EditorProjectsService,
    private readonly config: ConfigService,
  ) {}

  async assemble(
    user: AuthenticatedUser,
    brandId: string,
    runId: string,
    track: StoryboardPresenterTrack,
  ): Promise<{ editorProjectId: string; timeline: LongFormTimeline }> {
    const { organizationId } = user;
    const { config } = await this.store.read(organizationId, brandId, runId);
    const { plan } = config;
    if (!plan.longForm)
      throw new ConflictException(
        'Only a long-form storyboard is assembled this way.',
      );
    const isDraft = track === 'animatic';
    const chunks = this.readyChunks(plan, config[track]?.chunks, isDraft);
    const timeline = buildLongFormTimeline(plan, chunks);
    // A draft has no picture joins to hide and may run ahead of its B-roll.
    if (!isDraft && timeline.uncoveredJoins.length)
      throw new ConflictException(
        `Add a cutaway around ${timeline.uncoveredJoins.map(clock).join(', ')} to hide where the presenter renders meet.`,
      );
    const missing = timeline.cutaways.filter((item) => !item.assetId);
    if (!isDraft && missing.length)
      throw new ConflictException(
        `${missing.length} cutaway${missing.length === 1 ? ' has' : 's have'} no footage yet.`,
      );

    const presenter = storyboardARollPresenter(plan);
    const footage = await this.readFootage(organizationId, brandId, [
      ...timeline.aRoll.map((item) => item.assetId),
      ...(isDraft ? [presenter.avatarAssetId] : []),
    ]);
    const cutawayFootage = await this.readFootage(
      organizationId,
      brandId,
      timeline.cutaways.flatMap((item) => (item.assetId ? [item.assetId] : [])),
      isDraft,
    );
    for (const [id, asset] of cutawayFootage) footage.set(id, asset);
    const presenterCategory = isDraft
      ? ['VOICE', 'AUDIO']
      : ['VIDEO', 'AVATAR', 'VIDEO_EDIT'];
    if (
      timeline.aRoll.some(
        (item) =>
          !presenterCategory.includes(
            footage.get(item.assetId)?.category ?? '',
          ),
      )
    )
      throw new ConflictException(
        isDraft
          ? 'The animatic narration must be speech.'
          : 'The presenter track must be video.',
      );
    const tracks = isDraft
      ? this.buildDraftTracks(timeline, footage, presenter.avatarAssetId)
      : this.buildTracks(timeline, footage);
    const totalDurationFrames = frames(timeline.totalSeconds);
    const project = await this.editorProjects.create({
      brandId,
      config: {
        name: `${plan.title || 'Long-form video'}${isDraft ? ' (animatic)' : ''}`,
        settings: {
          ...SETTINGS[plan.format],
          backgroundColor: '#000000',
          fps: LONG_FORM_EDIT_FPS,
        },
        status: EditorProjectStatus.DRAFT,
        totalDurationFrames,
        storyboardRunId: runId,
      },
      organizationId,
      tracks,
      userId: user.userId ?? user.id,
    } as Parameters<EditorProjectsService['create']>[0]);
    return { editorProjectId: String(project.id), timeline };
  }

  /** Every chunk of the current narration, rendered and measured. */
  private readyChunks(
    plan: StoryboardPlan,
    rendered: readonly StoryboardARollChunk[] = [],
    isDraft = false,
  ): StoryboardARollChunk[] {
    const matches = matchStoryboardARollChunks(
      planStoryboardARollChunks(plan),
      rendered,
    );
    const chunks = matches.flatMap(({ previous }) =>
      previous?.state === 'ready' &&
      previous.assetId &&
      previous.durationSeconds !== undefined
        ? [previous]
        : [],
    );
    if (chunks.length !== matches.length)
      throw new ConflictException(
        isDraft
          ? 'Draft the animatic narration for the current script first.'
          : 'Render the presenter track for the current narration first.',
      );
    return chunks;
  }

  /**
   * Finished footage by id. A missing or unfinished asset fails the edit,
   * or with `skipUnusable` is left out (a draft shows the presenter there).
   */
  private async readFootage(
    organizationId: string,
    brandId: string,
    assetIds: readonly string[],
    skipUnusable = false,
  ): Promise<Map<string, FootageAsset>> {
    const ids = [...new Set(assetIds)];
    const rows = await this.prisma.ingredient.findMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: ids },
        category: { in: [...FOOTAGE_CATEGORIES] },
      }),
      select: {
        id: true,
        category: true,
        status: true,
        metadata: { select: { duration: true } },
      },
    });
    const footage = new Map<string, FootageAsset>();
    for (const row of rows) {
      if (!READY_STATUSES.has(row.status)) continue;
      const duration = row.metadata?.duration;
      footage.set(row.id, {
        category: row.category,
        ...(typeof duration === 'number' && duration > 0
          ? { durationSeconds: duration }
          : {}),
      });
    }
    const unusable = ids.filter((id) => !footage.has(id));
    if (unusable.length && !skipUnusable)
      throw new ConflictException(
        'Some footage is not a finished image or video of this brand. Replace it and try again.',
      );
    return footage;
  }

  private clip(
    assetId: string,
    asset: FootageAsset,
    startSeconds: number,
    durationSeconds: number,
    volume: number,
  ): IEditorClip {
    const isStill = asset.category === 'IMAGE';
    // A clip shorter than its slot holds the slot only as long as it runs; a
    // still holds it for as long as it is needed.
    const durationFrames = Math.max(
      1,
      Math.min(
        frames(durationSeconds),
        !isStill && asset.durationSeconds !== undefined
          ? frames(asset.durationSeconds)
          : Number.POSITIVE_INFINITY,
      ),
    );
    return {
      id: randomUUID(),
      ingredientId: assetId,
      ingredientUrl: `${this.config.ingredientsEndpoint}/${categoryToPlural(asset.category)}/${assetId}`,
      startFrame: frames(startSeconds),
      durationFrames,
      sourceStartFrame: 0,
      sourceEndFrame: durationFrames,
      effects: [],
      volume,
      ...(isStill ? { mediaType: 'image' as const } : {}),
    };
  }

  private buildTracks(
    timeline: LongFormTimeline,
    footage: ReadonlyMap<string, FootageAsset>,
  ): IEditorTrack[] {
    const asset = (id: string): FootageAsset => {
      const found = footage.get(id);
      if (!found) throw new ConflictException('Footage is missing.');
      return found;
    };
    return [
      {
        id: randomUUID(),
        type: EditorTrackType.VIDEO,
        name: 'Presenter',
        isMuted: false,
        isLocked: false,
        volume: 100,
        clips: timeline.aRoll.map((item) =>
          this.clip(
            item.assetId,
            asset(item.assetId),
            item.startSeconds,
            item.durationSeconds,
            100,
          ),
        ),
      },
      {
        id: randomUUID(),
        type: EditorTrackType.VIDEO,
        name: 'B-roll',
        isMuted: false,
        isLocked: false,
        // The presenter keeps talking under the B-roll.
        volume: 0,
        clips: timeline.cutaways.flatMap((item) =>
          item.assetId
            ? [
                this.clip(
                  item.assetId,
                  asset(item.assetId),
                  item.startSeconds,
                  item.durationSeconds,
                  0,
                ),
              ]
            : [],
        ),
      },
    ];
  }

  /**
   * The animatic: the presenter's photo for the whole video, the drafted
   * speech on an audio track, and whatever B-roll is ready above it.
   */
  private buildDraftTracks(
    timeline: LongFormTimeline,
    footage: ReadonlyMap<string, FootageAsset>,
    avatarAssetId: string,
  ): IEditorTrack[] {
    const [, bRoll] = this.buildTracks(
      {
        ...timeline,
        aRoll: [],
        cutaways: timeline.cutaways.filter(
          (item) => item.assetId && footage.has(item.assetId),
        ),
      },
      footage,
    );
    const photo = footage.get(avatarAssetId);
    if (photo?.category !== 'IMAGE')
      throw new ConflictException('The presenter needs an avatar image.');
    return [
      {
        id: randomUUID(),
        type: EditorTrackType.VIDEO,
        name: 'Presenter',
        isMuted: false,
        isLocked: false,
        volume: 100,
        clips: [this.clip(avatarAssetId, photo, 0, timeline.totalSeconds, 100)],
      },
      ...(bRoll ? [bRoll] : []),
      {
        id: randomUUID(),
        type: EditorTrackType.AUDIO,
        name: 'Narration',
        isMuted: false,
        isLocked: false,
        volume: 100,
        clips: timeline.aRoll.map((item) => {
          const speech = footage.get(item.assetId);
          if (!speech) throw new ConflictException('Narration is missing.');
          return this.clip(
            item.assetId,
            speech,
            item.startSeconds,
            item.durationSeconds,
            100,
          );
        }),
      },
    ];
  }
}
