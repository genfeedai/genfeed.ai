import { OrganizationSchema } from '@api/collections/organizations/schemas/organization.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('OrganizationSchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('Organization'),
          useValue: {
            create: vi.fn(),
            find: vi.fn(),
            findById: vi.fn(),
            findOne: vi.fn(),
            save: vi.fn(),
          },
        },
      ],
    }).compile();
  });

  it('should be defined', () => {
    expect(OrganizationSchema).toBeDefined();
  });

  it('does not declare a field-level index for prefix', () => {
    const prefixPath = OrganizationSchema.path('prefix');

    expect(prefixPath).toBeDefined();
    expect(prefixPath.options.index).toBeUndefined();
  });
});
