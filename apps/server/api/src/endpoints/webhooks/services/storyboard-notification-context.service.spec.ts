import { StoryboardNotificationContextService } from '@api/endpoints/webhooks/services/storyboard-notification-context.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

describe('StoryboardNotificationContextService', () => {
  const runId = 'clxrun0000000000001';
  const stillKey = `storyboard-still-${runId}-4f9c1c0e-6a53-4d6a-9d0b-2d1f4f5a9b10`;
  const findFirst = vi.fn();
  const warn = vi.fn();
  let service: StoryboardNotificationContextService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        StoryboardNotificationContextService,
        { provide: PrismaService, useValue: { contentRun: { findFirst } } },
        { provide: LoggerService, useValue: { warn } },
      ],
    }).compile();
    service = module.get(StoryboardNotificationContextService);
  });

  it('reads the storyboard of a still from its source action id', async () => {
    findFirst.mockResolvedValue({
      brand: { slug: 'acme' },
      config: { plan: { title: 'Steam shots' } },
      organization: { slug: 'org' },
    });

    await expect(
      service.find({ organizationId: 'org-1', sourceActionId: stillKey }),
    ).resolves.toEqual({
      layoutPath: `/org/acme/storyboard/${runId}`,
      runId,
      title: 'Steam shots',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: runId,
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('reads the storyboard of a scene video from its group id', async () => {
    findFirst.mockResolvedValue({
      brand: null,
      config: {},
      organization: { slug: 'org' },
    });

    await expect(
      service.find({
        groupId: `remix-${runId}-scene-1-video-1`,
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      layoutPath: undefined,
      runId,
      title: 'Untitled storyboard',
    });
  });

  it('skips ingredients that are not storyboard media', async () => {
    await expect(
      service.find({ organizationId: 'org-1', sourceActionId: null }),
    ).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('skips a remix run that is not a storyboard', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.find({
        groupId: `remix-${runId}-scene-1-video-1`,
        organizationId: 'org-1',
      }),
    ).resolves.toBeNull();
  });

  it('resolves null when the lookup fails', async () => {
    findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      service.find({ organizationId: 'org-1', sourceActionId: stillKey }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
