import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperClipEditService } from '@api/collections/clipper-projects/services/clipper-clip-edit.service';
import type { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
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
  id: 'project-1',
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
  handler: AgentClipperToolHandler;
  patches: Array<{ id: string; patch: Record<string, unknown> }>;
  projectPatches: Array<Record<string, unknown>>;
  queuedCount: { value: number };
}

function buildHarness(): Harness {
  const results = [RAW_CUT, AVATAR];
  const generated: Harness['generated'] = [];
  const patches: Harness['patches'] = [];
  const projectPatches: Harness['projectPatches'] = [];
  const queuedCount = { value: 1 };

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
    reconcileTerminalState: vi.fn(async () => undefined),
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
  return {
    generated,
    handler: new AgentClipperToolHandler(service),
    patches,
    projectPatches,
    queuedCount,
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
