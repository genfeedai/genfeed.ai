import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import type {
  ClipperResultsService,
  ProviderTerminalTransitionInput,
} from '@api/collections/clipper-results/clipper-results.service';
import { ArgilWebhookService } from '@api/endpoints/webhooks/argil/webhooks.argil.service';
import type { ArgilWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';

interface ClipRow {
  error?: string;
  id: string;
  organizationId: string;
  projectId: string;
  providerJobId: string;
  providerName: string;
  status: string;
  videoUrl?: string;
}

describe('ArgilWebhookService', () => {
  let clips: Map<string, ClipRow>;
  let libraryLinks: Array<{ clipperResultId: string; organizationId: string }>;
  let reconciledProjects: Array<[string, string | undefined]>;
  let service: ArgilWebhookService;

  beforeEach(() => {
    clips = new Map([
      [
        'clip-1',
        {
          id: 'clip-1',
          organizationId: 'org-1',
          projectId: 'project-1',
          providerJobId: 'video-1',
          providerName: 'argil',
          status: 'processing',
        },
      ],
    ]);
    libraryLinks = [];
    reconciledProjects = [];

    service = new ArgilWebhookService(
      {
        linkReadyClip: async (link: {
          clipperResultId: string;
          organizationId: string;
        }) => {
          libraryLinks.push(link);
          return { ...link, ingredientId: 'ingredient-1', status: 'linked' };
        },
      } as unknown as ClipperLibraryLinkService,
      {
        reconcileTerminalState: async (
          projectId: string,
          organizationId?: string,
        ) => {
          reconciledProjects.push([projectId, organizationId]);
        },
      } as unknown as ClipperProjectsService,
      {
        findOne: async ({ id }: { id: string }) => {
          const clip = clips.get(id);
          return clip ? { ...clip } : null;
        },
        // Compare-and-set: only a processing clip of this provider job moves.
        transitionProviderTerminal: async ({
          clipperResultId,
          providerJobId,
          providerName,
          ...terminal
        }: ProviderTerminalTransitionInput) => {
          await Promise.resolve();
          const clip = clips.get(clipperResultId);
          if (
            clip?.status !== 'processing' ||
            clip.providerJobId !== providerJobId ||
            clip.providerName !== providerName
          ) {
            return false;
          }
          Object.assign(clip, terminal);
          return true;
        },
      } as unknown as ClipperResultsService,
      { log: () => {}, warn: () => {} } as unknown as LoggerService,
    );
  });

  const success = (
    extras: unknown = { callbackId: 'clip-1' },
    videoId = 'video-1',
  ): ArgilWebhookPayload => ({
    data: { extras, videoId, videoUrl: `https://cdn.argil.ai/${videoId}.mp4` },
    event: 'VIDEO_GENERATION_SUCCESS',
  });
  const failure = (error: string): ArgilWebhookPayload => ({
    data: { error, extras: { callbackId: 'clip-1' }, videoId: 'video-1' },
    event: 'VIDEO_GENERATION_FAILED',
  });

  it('completes the matching clip, links it to the Library and reconciles its project', async () => {
    await service.handleCallback(success());

    expect(clips.get('clip-1')).toMatchObject({
      status: 'completed',
      videoUrl: 'https://cdn.argil.ai/video-1.mp4',
    });
    expect(libraryLinks).toEqual([
      { clipperResultId: 'clip-1', organizationId: 'org-1' },
    ]);
    expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
  });

  it('re-links but does not reconcile again on a replayed callback with string extras', async () => {
    await service.handleCallback(success());

    await service.handleCallback(
      success(JSON.stringify({ callbackId: 'clip-1' })),
    );

    expect(libraryLinks).toHaveLength(2);
    expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
  });

  it('rejects a callback for a different provider job', async () => {
    await expect(
      service.handleCallback(success(undefined, 'video-other')),
    ).rejects.toThrow('does not match the stored provider job');
    expect(clips.get('clip-1')?.status).toBe('processing');
  });

  it.each([
    ['no extras', success(null)],
    ['unparseable extras', success('{not json')],
  ])('rejects a callback with %s', async (_label, payload) => {
    await expect(service.handleCallback(payload)).rejects.toThrow(
      'requires data.videoId and extras.callbackId',
    );
  });

  it('ignores a callback whose clip no longer exists', async () => {
    clips.clear();

    await expect(service.handleCallback(success())).resolves.toBeUndefined();
    expect(reconciledProjects).toEqual([]);
  });

  it('marks only the matching clip failed', async () => {
    await service.handleCallback(failure('Render failed'));

    expect(clips.get('clip-1')).toMatchObject({
      error: 'Render failed',
      status: 'failed',
    });
    expect(libraryLinks).toEqual([]);
    expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
  });

  it('lets only one concurrent terminal callback reconcile the project', async () => {
    await Promise.all([
      service.handleCallback(success()),
      service.handleCallback(failure('Late failure')),
    ]);

    expect(clips.get('clip-1')?.status).toBe('completed');
    expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
  });
});
