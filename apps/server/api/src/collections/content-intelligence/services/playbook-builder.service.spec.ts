import type { CreatePlaybookDto } from '@api/collections/content-intelligence/dto/create-playbook.dto';
import type { PatternPlaybookDocument } from '@api/collections/content-intelligence/schemas/pattern-playbook.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentIntelligencePlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';

describe('PlaybookBuilderService', () => {
  const patternStoreService = {
    findByOrganization: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const playbook = {
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    createdById: 'user-1',
    data: {
      description: 'Existing description',
      name: 'Existing playbook',
      platform: ContentIntelligencePlatform.TWITTER,
    },
    id: 'playbook-1',
    isDeleted: false,
    organizationId: 'organization-1',
    platform: ContentIntelligencePlatform.TWITTER,
    sourceCreators: ['creator-1'],
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  } as PatternPlaybookDocument;

  let service: PlaybookBuilderService;

  beforeEach(() => {
    service = new PlaybookBuilderService(
      {} as PrismaService,
      patternStoreService as unknown as PatternStoreService,
      logger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists source creator IDs through the Prisma relation', async () => {
    const createSpy = vi.spyOn(service, 'create').mockResolvedValue(playbook);
    const dto = {
      description: 'Description',
      name: 'Playbook',
      platform: ContentIntelligencePlatform.TWITTER,
      sourceCreators: ['creator-1', 'creator-2'],
    } satisfies CreatePlaybookDto;

    await service.createPlaybook('organization-1', 'user-1', dto);

    expect(createSpy).toHaveBeenCalledWith(
      {
        createdById: 'user-1',
        data: {
          description: 'Description',
          insights: {
            benchmarks: {},
            contentMix: {},
            hashtagStrategy: {},
            postingSchedule: {},
            topHooks: [],
          },
          isActive: true,
          name: 'Playbook',
          patternsCount: 0,
          platform: ContentIntelligencePlatform.TWITTER,
        },
        organization: { connect: { id: 'organization-1' } },
        sourceCreators: {
          connect: [{ id: 'creator-1' }, { id: 'creator-2' }],
        },
      },
      ['sourceCreators'],
    );
  });

  it('uses related creator IDs when building insights', async () => {
    vi.spyOn(service, 'findOne').mockResolvedValue(playbook);
    vi.spyOn(service, 'patch').mockResolvedValue(playbook);
    patternStoreService.findByOrganization.mockResolvedValue([]);

    await service.buildInsights('playbook-1', 'organization-1');

    expect(patternStoreService.findByOrganization).toHaveBeenCalledWith(
      'organization-1',
      {
        platform: ContentIntelligencePlatform.TWITTER,
        sourceCreator: 'creator-1',
      },
    );
    expect(service.patch).toHaveBeenCalledWith(
      'playbook-1',
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Existing description',
        }),
      }),
      ['sourceCreators'],
    );
  });

  it('updates creator membership through the Prisma relation', async () => {
    vi.spyOn(service, 'findOne').mockResolvedValue(playbook);
    const patchSpy = vi.spyOn(service, 'patch').mockResolvedValue(playbook);

    await service.addCreatorToPlaybook(
      'playbook-1',
      'creator-2',
      'organization-1',
    );

    expect(patchSpy).toHaveBeenCalledWith(
      'playbook-1',
      {
        sourceCreators: {
          set: [{ id: 'creator-1' }, { id: 'creator-2' }],
        },
      },
      ['sourceCreators'],
    );
  });
});
