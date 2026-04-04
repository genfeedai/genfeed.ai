import { OptimizationSchema } from '@api/collections/optimizers/schemas/optimization.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('OptimizationSchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('Optimization'),
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
    expect(OptimizationSchema).toBeDefined();
  });

  // it('should have required fields', () => {
  //   // Test schema structure
  // });
});
