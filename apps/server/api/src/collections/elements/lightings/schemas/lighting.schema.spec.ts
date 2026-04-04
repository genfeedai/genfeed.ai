import { ElementLightingSchema } from '@api/collections/elements/lightings/schemas/lighting.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('ElementLightingSchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('ElementLighting'),
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
    expect(ElementLightingSchema).toBeDefined();
  });
});
