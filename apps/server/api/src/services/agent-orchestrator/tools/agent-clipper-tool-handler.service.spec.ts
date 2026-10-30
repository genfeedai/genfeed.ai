import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperClipEditService } from '@api/collections/clipper-projects/services/clipper-clip-edit.service';
import type { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
import type { ClipperProjectIngestionService } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { AgentClipperToolHandler } from '@api/services/agent-orchestrator/tools/agent-clipper-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = {
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

const PROJECT = {
  highlights: [
    {
      clip_type: 'story',
      end_time: 30,
      id: 'highlight-1',
      script: 'We almost shut the company down.',
      start_time: 10,
      summary: 'Why this works',
      title: 'The turnaround',
      virality_score: 88,
    },
  ],
  id: 'project-1',
  status: 'completed',
  organizationId: 'org-1',
  source: { durationSeconds: 120 },
  sourceVideoS3Key: 'sources/project-1.mp4',
  transcriptSegments: [
    { end: 12, start: 10, text: 'We almost shut the company down.' },
    { end: 18, start: 12, text: 'Then one customer changed everything.' },
    { end: 30, start: 20, text: 'Here is exactly what happened next.' },
  ],
};

const RAW_CUT = {
  clipType: 'story',
  endTime: 30,
  id: 'clip-1',
  index: 0,
  mode: 'raw-cut',
  organizationId: 'org-1',
  projectId: 'project-1',
  startTime: 10,
  status: 'completed',
  summary: 'The turnaround',
  tags: ['story'],
  title: 'The turnaround',
  viralityScore: 80,
};

const AVATAR = { ...RAW_CUT, id: 'clip-2', mode: 'avatar' };

interface Harness {
  generated: Array<{ endTime: number; startTime: number; title: string }>;
  analyzeYoutube: ReturnType<typeof vi.fn>;
  handler: AgentClipperToolHandler;
  patches: Array<{ id: string; patch: Record<string, unknown> }>;
  projectPatches: Array<Record<string, unknown>>;
  queuedCount: { value: number };
  reconciled: string[];
  shouldGenerationFail: { value: boolean };
}

function buildHarness(): Harness {
  const results = [RAW_CUT, AVATAR];
  const generated: Harness['generated'] = [];
  const patches: Harness['patches'] = [];
  const projectPatches: Harness['projectPatches'] = [];
  const queuedCount = { value: 1 };
  const reconciled: string[] = [];
  const shouldGenerationFail = { value: false };

  const resultsService = {
    findByProject: vi.fn(async (projectId: string, organizationId: string) =>
      results.filter(
        (result) =>
          result.projectId === projectId &&
          result.organizationId === organizationId,
      ),
    ),
    findOne: vi.fn(async (query: { id: string; organizationId: string }) =>
      results.find(
        (result) =>
          result.id === query.id &&
          result.organizationId === query.organizationId,
      ),
    ),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      patches.push({ id, patch });
    }),
  } as unknown as ClipperResultsService;

  const projectsService = {
    findOne: vi.fn(async (query: { id: string; organizationId: string }) =>
      query.id === PROJECT.id && query.organizationId === PROJECT.organizationId
        ? PROJECT
        : null,
    ),
    patch: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
      projectPatches.push(patch);
    }),
    reconcileTerminalState: vi.fn(async (projectId: string) => {
      reconciled.push(projectId);
    }),
  } as unknown as ClipperProjectsService;

  const generationService = {
    generateClips: vi.fn(
      async (input: {
        highlights: Array<{
          end_time: number;
          start_time: number;
          title: string;
        }>;
      }) => {
        if (shouldGenerationFail.value) {
          throw new Error('Clip generation workflow failed');
        }
        for (const highlight of input.highlights) {
          generated.push({
            endTime: highlight.end_time,
            startTime: highlight.start_time,
            title: highlight.title,
          });
        }
        return {
          clipperResultIds: queuedCount.value > 0 ? ['clip-edited'] : [],
          queuedClipCount: queuedCount.value,
        };
      },
    ),
  } as unknown as ClipperGenerationService;

  const service = new ClipperClipEditService(
    projectsService,
    resultsService,
    generationService,
    { log: vi.fn() } as unknown as LoggerService,
  );
  const analyzeYoutube = vi.fn(async () => ({
    identity: {},
    projectId: 'project-new',
    status: 'pending',
  }));
  return {
    analyzeYoutube,
    generated,
    handler: new AgentClipperToolHandler(
      service,
      { analyzeYoutube } as unknown as ClipperProjectIngestionService,
      projectsService,
    ),
    patches,
    projectPatches,
    queuedCount,
    reconciled,
    shouldGenerationFail,
  };
}

describe('AgentClipperToolHandler', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  describe('get_clip_context', () => {
    it('returns the clip with the transcript around it', async () => {
      const result = await harness.handler.getClipContext(
        { clipperResultId: 'clip-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        clip: { clipperResultId: 'clip-1', isEditable: true, startTime: 10 },
        projectId: 'project-1',
        sourceDurationSeconds: 120,
      });
      expect(
        (result.data as { transcript: Array<{ text: string }> }).transcript.map(
          (line) => line.text,
        ),
      ).toEqual([
        'We almost shut the company down.',
        'Then one customer changed everything.',
        'Here is exactly what happened next.',
      ]);
    });

    it('lists the clips of a project and flags the ones that cannot be edited', async () => {
      const result = await harness.handler.getClipContext(
        { projectId: 'project-1' },
        ctx,
      );

      const clips = (
        result.data as {
          clips: Array<{ clipperResultId: string; isEditable: boolean }>;
        }
      ).clips;
      expect(
        clips.map((clip) => [clip.clipperResultId, clip.isEditable]),
      ).toEqual([
        ['clip-1', true],
        ['clip-2', false],
      ]);
    });

    it('needs exactly one of clipperResultId or projectId', async () => {
      for (const params of [
        {},
        { clipperResultId: 'clip-1', projectId: 'project-1' },
      ]) {
        const result = await harness.handler.getClipContext(params, ctx);
        expect(result).toMatchObject({ success: false });
        expect(result.error).toContain('exactly one');
      }
    });

    it('cannot read another organization clip', async () => {
      const result = await harness.handler.getClipContext(
        { clipperResultId: 'clip-1' },
        { ...ctx, organizationId: 'org-2' },
      );

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });
  });

  describe('start_clip_analysis', () => {
    it('starts the free analysis as the calling organization', async () => {
      const result = await harness.handler.analyzeProject(
        {
          maxClips: 99,
          youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
        },
        { ...ctx, brandId: 'brand-1' },
      );

      expect(result).toEqual({
        creditsUsed: 0,
        data: { projectId: 'project-new', status: 'pending' },
        success: true,
      });
      expect(harness.analyzeYoutube).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          id: 'user-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          maxClips: 30,
          youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
        },
      );
    });

    it('needs a video link', async () => {
      const result = await harness.handler.analyzeProject({}, ctx);

      expect(result).toMatchObject({
        error: 'youtubeUrl is required',
        success: false,
      });
      expect(harness.analyzeYoutube).not.toHaveBeenCalled();
    });
  });

  describe('get_clip_highlights', () => {
    it('returns the highlights with what was said in each', async () => {
      const result = await harness.handler.getHighlights(
        { projectId: 'project-1' },
        ctx,
      );

      expect(result.data).toEqual({
        highlights: [
          {
            clipType: 'story',
            endTime: 30,
            id: 'highlight-1',
            script: 'We almost shut the company down.',
            startTime: 10,
            title: 'The turnaround',
            viralityScore: 88,
          },
        ],
        projectId: 'project-1',
        status: 'completed',
      });
    });

    it('cannot read another organization project', async () => {
      const result = await harness.handler.getHighlights(
        { projectId: 'project-1' },
        { ...ctx, organizationId: 'org-2' },
      );

      expect(result).toMatchObject({
        error: 'Clip project not found',
        success: false,
      });
    });
  });

  describe('edit_clip', () => {
    it('queues the new window as a new clip and leaves the original alone', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1', startTime: 12, endTime: 30 },
        ctx,
      );

      expect(result).toMatchObject({
        creditsUsed: 0,
        data: {
          clipperResultId: 'clip-edited',
          duration: 18,
          editedFromClipperResultId: 'clip-1',
          endTime: 30,
          startTime: 12,
          status: 'extracting',
        },
        success: true,
      });
      expect(harness.generated).toEqual([
        { endTime: 30, startTime: 12, title: 'The turnaround (edited)' },
      ]);
      expect(harness.patches).toEqual([
        {
          id: 'clip-edited',
          patch: { editedFromClipperResultId: 'clip-1' },
        },
      ]);
      expect(harness.projectPatches).toEqual([
        { error: null, status: 'generating', terminalAt: null },
      ]);
    });

    it('rejects a call that changes nothing', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('startTime, endTime or title');
      expect(harness.generated).toEqual([]);
    });

    it('rejects times that are not numbers instead of ignoring them', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1', startTime: '12' },
        ctx,
      );

      expect(result.error).toBe('startTime must be a number of seconds');
      expect(harness.generated).toEqual([]);
    });

    it('requires a clip id', async () => {
      const result = await harness.handler.editClip({ startTime: 12 }, ctx);

      expect(result.error).toBe('clipperResultId is required');
    });

    it('relays the reason when the planner refuses an avatar clip', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-2', endTime: 28 },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only raw-cut clips can be edited');
      expect(harness.generated).toEqual([]);
      expect(harness.projectPatches).toEqual([]);
    });

    it('relays the reason when a window has no speech', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1', startTime: 60, endTime: 90 },
        ctx,
      );

      expect(result.error).toContain('Nobody speaks');
      expect(harness.generated).toEqual([]);
    });

    it('does not edit another organization clip', async () => {
      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1', endTime: 28 },
        { ...ctx, organizationId: 'org-2' },
      );

      expect(result.success).toBe(false);
      expect(harness.generated).toEqual([]);
    });

    it('puts the project back to its finished state when generation throws', async () => {
      harness.shouldGenerationFail.value = true;

      await expect(
        harness.handler.editClip(
          { clipperResultId: 'clip-1', endTime: 28 },
          ctx,
        ),
      ).rejects.toThrow('Clip generation workflow failed');

      expect(harness.reconciled).toEqual(['project-1']);
      expect(harness.patches).toEqual([]);
    });

    it('says the original is unchanged when nothing could be queued', async () => {
      harness.queuedCount.value = 0;

      const result = await harness.handler.editClip(
        { clipperResultId: 'clip-1', endTime: 28 },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('original clip is unchanged');
      expect(harness.patches).toEqual([]);
    });
  });
});
