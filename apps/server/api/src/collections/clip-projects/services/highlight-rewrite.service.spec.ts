import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HighlightRewriteService } from './highlight-rewrite.service';

describe('HighlightRewriteService', () => {
  let service: HighlightRewriteService;
  let mockOpenRouterService: any;
  let mockClipProjectsService: any;
  let mockLoggerService: any;

  const mockProject = {
    _id: 'project-1',
    highlights: [
      {
        clip_type: 'educational',
        end_time: 30,
        id: 'h1',
        start_time: 0,
        summary: 'This is a test script about how AI is changing the world.',
        tags: ['ai'],
        title: 'Test Highlight',
        virality_score: 75,
      },
      {
        clip_type: 'hook',
        end_time: 60,
        id: 'h2',
        start_time: 30,
        summary: '',
        tags: [],
        title: 'Another Highlight',
        virality_score: 60,
      },
    ],
    isDeleted: false,
  };

  beforeEach(() => {
    mockOpenRouterService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content:
                'Stop scrolling. AI just changed everything. Here is why.',
            },
          },
        ],
      }),
    };

    mockClipProjectsService = {
      findOne: vi.fn().mockResolvedValue(mockProject),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    mockLoggerService = {
      error: vi.fn(),
    };

    service = new HighlightRewriteService(
      mockOpenRouterService,
      mockClipProjectsService,
      mockLoggerService,
    );
  });

  it('returns rewritten script from LLM', async () => {
    const result = await service.rewrite('project-1', 'h1', 'tiktok', 'hook');

    expect(result.rewrittenScript).toBe(
      'Stop scrolling. AI just changed everything. Here is why.',
    );
    expect(result.originalScript).toBe(
      'This is a test script about how AI is changing the world.',
    );
    expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('persists rewrittenScript to highlight in DB', async () => {
    await service.rewrite('project-1', 'h1', 'tiktok', 'hook');

    expect(mockClipProjectsService.patch).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        highlights: expect.arrayContaining([
          expect.objectContaining({
            id: 'h1',
            summary: 'Stop scrolling. AI just changed everything. Here is why.',
          }),
        ]),
      }),
    );
  });

  it('uses correct platform in prompt', async () => {
    await service.rewrite('project-1', 'h1', 'linkedin', 'educational');

    const callArgs = mockOpenRouterService.chatCompletion.mock.calls[0][0];
    const prompt = callArgs.messages[0].content;

    expect(prompt).toContain('linkedin');
    expect(prompt).toContain('educational');
  });

  it('handles LLM error gracefully', async () => {
    mockOpenRouterService.chatCompletion.mockRejectedValue(
      new Error('LLM timeout'),
    );

    await expect(
      service.rewrite('project-1', 'h1', 'tiktok', 'hook'),
    ).rejects.toThrow(InternalServerErrorException);

    expect(mockLoggerService.error).toHaveBeenCalled();
  });

  it('trims whitespace from response', async () => {
    mockOpenRouterService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: '\n  Stop scrolling. AI just changed everything.  \n',
          },
        },
      ],
    });

    const result = await service.rewrite('project-1', 'h1', 'tiktok', 'hook');

    expect(result.rewrittenScript).toBe(
      'Stop scrolling. AI just changed everything.',
    );
  });

  it('handles missing originalScript', async () => {
    await expect(
      service.rewrite('project-1', 'h2', 'tiktok', 'hook'),
    ).rejects.toThrow(NotFoundException);
  });
});
