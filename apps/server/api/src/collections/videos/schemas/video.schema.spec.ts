import { VideoSchema } from '@api/collections/videos/schemas/video.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('VideoSchema', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      providers: [
        {
          provide: getModelToken('Video'),
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
    expect(VideoSchema).toBeDefined();
  });

  // it('should have required fields', () => {
  //   // Test schema structure
  // });
});
