import { WorkflowSchema } from '@api/collections/workflows/schemas/workflow.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowSchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('Workflow'),
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
    expect(WorkflowSchema).toBeDefined();
  });

  // it('should have required fields', () => {
  //   // Test schema structure
  // });
});
