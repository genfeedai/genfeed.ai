import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  LONG_FORM_EDIT_FPS,
  STORYBOARD_EDIT_SETTINGS,
} from '@api/collections/content-runs/services/storyboard-long-form-assembly.service';
import { storyboardVideoFormat } from '@api/collections/content-runs/services/storyboard-plan-state';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  categoryToPlural,
  EditorProjectStatus,
  EditorTrackType,
} from '@genfeedai/contracts';
import type { StoryboardShotRender } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import type { IEditorClip } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { ConflictException, Injectable } from '@nestjs/common';

const VIDEO_CATEGORIES = ['VIDEO', 'VIDEO_EDIT'] as const;
const READY_STATUSES = new Set(['GENERATED', 'VALIDATED', 'UPLOADED']);

function frames(seconds: number): number {
  return Math.round(seconds * LONG_FORM_EDIT_FPS);
}

/** A final that rendered, still matches its shot and was not failed by QA. */
function isAssemblable(render: StoryboardShotRender): boolean {
  return (
    render.stage === 'final' &&
    render.state === 'ready' &&
    render.isCurrent &&
    Boolean(render.assetId) &&
    (render.qa?.state === 'passed' || render.qa?.state === 'unavailable')
  );
}

/**
 * Lays a shot-by-shot video's finals back to back, in shot order, with their
 * own sound, and opens them as an Editor project (#9622), as long-form does.
 */
@Traced()
@Injectable()
export class StoryboardVideoAssemblyService {
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
  ): Promise<{ editorProjectId: string; shotIds: string[] }> {
    const { organizationId } = user;
    const { record } = await this.store.read(organizationId, brandId, runId);
    const run = projectStoryboardRun(record);
    const { plan } = run.config;
    if (!plan || plan.kind === 'slideshow' || plan.longForm)
      throw new ConflictException(
        'Only a shot-by-shot video is assembled this way.',
      );
    const shots = [...plan.shots].sort((a, b) => a.ordinal - b.ordinal);
    const finals = new Map(
      (run.config.shotRenders ?? [])
        .filter(isAssemblable)
        .map((render) => [render.shotId, render]),
    );
    const missing = shots.filter((shot) => !finals.has(shot.id));
    if (!shots.length || missing.length)
      throw new ConflictException(
        missing.length
          ? `Render and check the final of shot ${missing.map((shot) => shot.ordinal).join(', ')} first.`
          : 'The storyboard has no shots.',
      );
    const ordered = shots.flatMap((shot) => {
      const render = finals.get(shot.id);
      return render?.assetId ? [{ render, assetId: render.assetId }] : [];
    });
    const clips = await this.readClips(
      organizationId,
      brandId,
      ordered.map((item) => item.assetId),
    );
    let startFrame = 0;
    const timeline = ordered.map(({ render, assetId }): IEditorClip => {
      const clip = clips.get(assetId);
      if (!clip)
        throw new ConflictException(
          'A final render is not a finished video of this brand.',
        );
      const durationFrames = Math.max(
        1,
        frames(Math.min(render.durationSeconds, clip.durationSeconds)),
      );
      const item: IEditorClip = {
        id: randomUUID(),
        ingredientId: assetId,
        ingredientUrl: `${this.config.ingredientsEndpoint}/${categoryToPlural(clip.category)}/${assetId}`,
        startFrame,
        durationFrames,
        sourceStartFrame: 0,
        sourceEndFrame: durationFrames,
        effects: [],
        volume: 100,
      };
      startFrame += durationFrames;
      return item;
    });
    const project = await this.editorProjects.create({
      brandId,
      config: {
        name: plan.title || 'Storyboard video',
        settings: {
          ...STORYBOARD_EDIT_SETTINGS[storyboardVideoFormat(plan)],
          backgroundColor: '#000000',
          fps: LONG_FORM_EDIT_FPS,
        },
        status: EditorProjectStatus.DRAFT,
        totalDurationFrames: startFrame,
        storyboardRunId: runId,
      },
      organizationId,
      tracks: [
        {
          id: randomUUID(),
          type: EditorTrackType.VIDEO,
          name: 'Shots',
          isMuted: false,
          isLocked: false,
          volume: 100,
          clips: timeline,
        },
      ],
      userId: user.userId ?? user.id,
    } as Parameters<EditorProjectsService['create']>[0]);
    return {
      editorProjectId: String(project.id),
      shotIds: ordered.map((item) => item.render.shotId),
    };
  }

  /** Finished clips of this brand by id, with their measured length. */
  private async readClips(
    organizationId: string,
    brandId: string,
    assetIds: readonly string[],
  ): Promise<Map<string, { category: string; durationSeconds: number }>> {
    const rows = await this.prisma.ingredient.findMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: [...new Set(assetIds)] },
        category: { in: [...VIDEO_CATEGORIES] },
      }),
      select: {
        id: true,
        category: true,
        status: true,
        metadata: { select: { duration: true } },
      },
    });
    const clips = new Map<
      string,
      { category: string; durationSeconds: number }
    >();
    for (const row of rows) {
      if (!READY_STATUSES.has(row.status)) continue;
      const duration = row.metadata?.duration;
      clips.set(row.id, {
        category: row.category,
        durationSeconds:
          typeof duration === 'number' && duration > 0
            ? duration
            : Number.POSITIVE_INFINITY,
      });
    }
    return clips;
  }
}
