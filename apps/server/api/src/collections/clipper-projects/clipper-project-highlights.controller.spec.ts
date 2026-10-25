import { ClipperProjectHighlightsController } from '@api/collections/clipper-projects/clipper-project-highlights.controller';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { RewriteHighlightDto } from '@api/collections/clipper-projects/dto/rewrite-highlight.dto';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { HighlightRewriteService } from '@api/collections/clipper-projects/services/highlight-rewrite.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('ClipperProjectHighlightsController', () => {
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
  } as unknown as ClipperProjectDocument;

  let controller: ClipperProjectHighlightsController;
  let clipperProjectsService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let highlightRewriteService: {
    rewrite: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipperProjectsService = {
      findOne: vi.fn().mockResolvedValue(project),
    };
    highlightRewriteService = {
      rewrite: vi.fn().mockResolvedValue({
        originalScript: 'Original script',
        rewrittenScript: 'Stop scrolling. This changes everything.',
      }),
    };
    controller = new ClipperProjectHighlightsController(
      {} as LoggerService,
      clipperProjectsService as unknown as ClipperProjectsService,
      highlightRewriteService as unknown as HighlightRewriteService,
    );
  });

  it('returns the existing highlights payload within the current organization', async () => {
    const result = await controller.getHighlights(
      currentUser as never,
      projectId,
    );

    expect(clipperProjectsService.findOne).toHaveBeenCalledWith({
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
    clipperProjectsService.findOne.mockResolvedValue({
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
    clipperProjectsService.findOne.mockResolvedValue(null);

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
