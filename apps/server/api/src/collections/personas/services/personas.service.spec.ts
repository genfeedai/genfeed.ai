import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PersonasService', () => {
  let service: PersonasService;
  let prisma: { persona: { create: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = {
      persona: {
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonasService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PersonasService);
  });

  it('rejects invalid handles before writing', async () => {
    await expect(
      service.create({
        handle: 'anna doe',
        label: 'Anna',
        organizationId: testId('org'),
        userId: testId('user'),
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(prisma.persona.create).not.toHaveBeenCalled();
  });

  it('maps a unique-handle Prisma conflict to a validation error', async () => {
    prisma.persona.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        constraint: 'personas_org_brand_handle_live_key',
        target: ['handle'],
      },
    });

    await expect(
      service.create({
        brandId: testId('brand'),
        handle: 'anna',
        label: 'Anna',
        organizationId: testId('org'),
        userId: testId('user'),
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });
});
