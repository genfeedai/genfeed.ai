import { ArticleTranscriptService } from '@api/collections/articles/services/article-transcript.service';
import type { TemplatesService } from '@api/collections/templates/services/templates.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

describe('ArticleTranscriptService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates, persists, and links an article from a transcript', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          data: {
            transcriptText: 'A useful transcript for a generated article.',
            videoTitle: 'Original video',
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const configService = {
      get: vi.fn().mockReturnValue('https://api.example.com'),
    } as unknown as ConfigService;
    const logger = { error: vi.fn() } as unknown as LoggerService;
    const replicateService = {
      generateTextCompletionSync: vi
        .fn()
        .mockResolvedValue('# Generated title\n\nGenerated body'),
    } as unknown as ReplicateService;
    const promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'write' } }),
    } as unknown as PromptBuilderService;
    const templatesService = {
      getRenderedPrompt: vi.fn().mockResolvedValue('Write the article'),
    } as unknown as TemplatesService;
    const service = new ArticleTranscriptService(
      configService,
      logger,
      replicateService,
      promptBuilderService,
      templatesService,
    );
    const createArticle = vi.fn().mockResolvedValue({ id: 'article_1' });

    const result = await service.generateFromTranscript(
      'transcript_1',
      'user_1',
      'org_1',
      'brand_1',
      createArticle,
    );

    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '# Generated title\n\nGenerated body',
        label: 'Generated title',
        summary: 'A useful transcript for a generated article.',
      }),
      'user_1',
      'org_1',
      'brand_1',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/transcripts/transcript_1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result).toEqual({ id: 'article_1' });
  });
});
