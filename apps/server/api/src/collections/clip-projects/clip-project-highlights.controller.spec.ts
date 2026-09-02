import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { RewriteHighlightDto } from '@api/collections/clip-projects/dto/rewrite-highlight.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import type { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('ClipProjectHighlightsController', () => {
  const organizationId = testId('org');
  const projectId = testId('project');
  const currentUser = { organizationId };
  const project = {
    highlights: [
      {
        clip_type: 'hook',
        end_time: 30,
        id: 'highlight-1',
        start_time: 0,
        summary: 'Original script',
        tags: ['viral'],
        title: 'Original title',
        virality_score: 90,
      },
    ],
    id: projectId,
    isDeleted: false,
    organizationId,
    status: 'analyzed',
  } as unknown as ClipProjectDocument;

  let controller: ClipProjectHighlightsController;
  let clipProjectsService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let highlightRewriteService: {
    rewrite: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipProjectsService = {
      findOne: vi.fn().mockResolvedValue(project),
    };
    highlightRewriteService = {
      rewrite: vi.fn().mockResolvedValue({
        originalScript: 'Original script',
        rewrittenScript: 'Stop scrolling. This changes everything.',
      }),
    };
    controller = new ClipProjectHighlightsController(
      {} as LoggerService,
      clipProjectsService as unknown as ClipProjectsService,
      highlightRewriteService as unknown as HighlightRewriteService,
    );
  });

  it('returns the existing highlights payload within the current organization', async () => {
    const result = await controller.getHighlights(
      currentUser as never,
      projectId,
    );

    expect(clipProjectsService.findOne).toHaveBeenCalledWith({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    expect(result).toEqual({
      highlights: project.highlights,
      projectId,
      status: 'analyzed',
    });
  });

  it('preserves the empty highlights fallback', async () => {
    clipProjectsService.findOne.mockResolvedValue({
      ...project,
      highlights: undefined,
    });

    await expect(
      controller.getHighlights(currentUser as never, projectId),
    ).resolves.toEqual({
      highlights: [],
      projectId,
      status: 'analyzed',
    });
  });

  it('preserves the missing project error', async () => {
    clipProjectsService.findOne.mockResolvedValue(null);

    await expect(
      controller.getHighlights(currentUser as never, projectId),
    ).rejects.toThrow(NotFoundException);
  });

  it('delegates rewrite with tenant scope and the existing defaults', async () => {
    const result = await controller.rewriteHighlight(
      currentUser as never,
      projectId,
      'highlight-1',
      {},
    );

    expect(highlightRewriteService.rewrite).toHaveBeenCalledWith(
      projectId,
      'highlight-1',
      organizationId,
      'tiktok',
      'hook',
    );
    expect(result).toEqual({
      originalScript: 'Original script',
      rewrittenScript: 'Stop scrolling. This changes everything.',
    });
  });

  it('passes explicit platform and tone through unchanged', async () => {
    await controller.rewriteHighlight(
      currentUser as never,
      projectId,
      'highlight-1',
      { platform: 'linkedin', tone: 'educational' },
    );

    expect(highlightRewriteService.rewrite).toHaveBeenCalledWith(
      projectId,
      'highlight-1',
      organizationId,
      'linkedin',
      'educational',
    );
  });

  it('preserves rewrite DTO defaults and enum validation', () => {
    const defaults = plainToInstance(RewriteHighlightDto, {});
    const invalid = plainToInstance(RewriteHighlightDto, {
      platform: 'facebook',
      tone: 'salesy',
    });

    expect(defaults).toMatchObject({ platform: 'tiktok', tone: 'hook' });
    expect(validateSync(defaults)).toEqual([]);
    const invalidProperties = validateSync(invalid).map(
      (error) => error.property,
    );
    expect(invalidProperties).toContain('platform');
    expect(invalidProperties).toContain('tone');
  });
});
