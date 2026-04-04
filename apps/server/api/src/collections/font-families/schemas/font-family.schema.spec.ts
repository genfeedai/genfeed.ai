import { FontFamilySchema } from '@api/collections/font-families/schemas/font-family.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('FontFamilySchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('FontFamily'),
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
    expect(FontFamilySchema).toBeDefined();
  });

  // it('should have required fields', () => {
  //   // Test schema structure
  // });
});
