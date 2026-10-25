import { ClipperProjectGenerationController } from '@api/collections/clipper-projects/clipper-project-generation.controller';
import { ClipperProjectHandoffsController } from '@api/collections/clipper-projects/clipper-project-handoffs.controller';
import { ClipperProjectHighlightsController } from '@api/collections/clipper-projects/clipper-project-highlights.controller';
import { ClipperProjectIngestionController } from '@api/collections/clipper-projects/clipper-project-ingestion.controller';
import { ClipperProjectPublicToolController } from '@api/collections/clipper-projects/clipper-project-public-tool.controller';
import { ClipperProjectReferenceFramesController } from '@api/collections/clipper-projects/clipper-project-reference-frames.controller';
import { ClipperProjectsController } from '@api/collections/clipper-projects/clipper-projects.controller';
import { ClipperProjectsModule } from '@api/collections/clipper-projects/clipper-projects.module';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Clip Projects split controllers', () => {
  it.each([
    [
      'createFromYoutube',
      'from-youtube',
      'ClipperProjectsController.createFromYoutube',
      'YouTube → Clip Factory',
      'Create a clip project from a YouTube URL. Downloads audio, transcribes, detects highlights, and generates avatar or raw-cut clips asynchronously.',
    ],
    [
      'analyzeYoutube',
      'analyze',
      'ClipperProjectsController.analyzeYoutube',
      'Analyze YouTube video for highlights',
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Analysis does not charge credits. Returns projectId to poll for results.',
    ],
  ] as const)(
    'preserves %s ingestion route and metadata',
    (methodName, path, operationId, summary, description) => {
      const handler = Reflect.get(
        ClipperProjectIngestionController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipperProjectIngestionController),
      ).toBe('clipper-projects');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.ACCEPTED,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ description, operationId, summary });
    },
  );

  it.each([
    [
      'getHighlights',
      ':projectId/highlights',
      RequestMethod.GET,
      'ClipperProjectsController.getHighlights',
    ],
    [
      'rewriteHighlight',
      ':projectId/highlights/:highlightId/rewrite',
      RequestMethod.POST,
      'ClipperProjectsController.rewriteHighlight',
    ],
  ] as const)(
    'preserves %s route and OpenAPI metadata',
    (methodName, path, method, operationId) => {
      const handler = Reflect.get(
        ClipperProjectHighlightsController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipperProjectHighlightsController),
      ).toBe('clipper-projects');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId });
    },
  );

  it('preserves rewrite HTTP 200', () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        ClipperProjectHighlightsController.prototype.rewriteHighlight,
      ),
    ).toBe(HttpStatus.OK);
  });

  it.each([
    [
      'generateClips',
      ':projectId/generate',
      RequestMethod.POST,
      HttpStatus.ACCEPTED,
      'ClipperProjectsController.generateClips',
    ],
    [
      'retryFailedClips',
      ':projectId/retry-failed',
      RequestMethod.POST,
      HttpStatus.ACCEPTED,
      'ClipperProjectsController.retryFailedClips',
    ],
    [
      'getHookClipApproval',
      ':projectId/hook-approval',
      RequestMethod.GET,
      undefined,
      'ClipperProjectsController.getHookClipApproval',
    ],
    [
      'submitHookClipDecision',
      ':projectId/hook-approval',
      RequestMethod.POST,
      HttpStatus.OK,
      'ClipperProjectsController.submitHookClipDecision',
    ],
  ] as const)(
    'preserves %s generation route and OpenAPI metadata',
    (methodName, path, method, httpCode, operationId) => {
      const handler = Reflect.get(
        ClipperProjectGenerationController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipperProjectGenerationController),
      ).toBe('clipper-projects');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(httpCode);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId });
    },
  );

  it('preserves the shared clipper-projects role guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipperProjectIngestionController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipperProjectHighlightsController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipperProjectGenerationController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipperProjectsController),
    ).toContain(RolesGuard);
  });

  it('preserves the clipper-projects tag and bearer authentication metadata', () => {
    expect(
      Reflect.getMetadata(
        'swagger/apiUseTags',
        ClipperProjectIngestionController,
      ),
    ).toEqual(['clipper-projects']);
    expect(
      Reflect.getMetadata(
        'swagger/apiSecurity',
        ClipperProjectIngestionController,
      ),
    ).toEqual([{ bearer: [] }]);
    expect(
      Reflect.getMetadata(
        'swagger/apiUseTags',
        ClipperProjectHighlightsController,
      ),
    ).toEqual(['clipper-projects']);
    expect(
      Reflect.getMetadata(
        'swagger/apiSecurity',
        ClipperProjectHighlightsController,
      ),
    ).toEqual([{ bearer: [] }]);
    expect(
      Reflect.getMetadata(
        'swagger/apiUseTags',
        ClipperProjectGenerationController,
      ),
    ).toEqual(['clipper-projects']);
    expect(
      Reflect.getMetadata(
        'swagger/apiSecurity',
        ClipperProjectGenerationController,
      ),
    ).toEqual([{ bearer: [] }]);
  });

  it('registers static sibling controllers before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ClipperProjectsModule),
    ).toEqual([
      ClipperProjectIngestionController,
      ClipperProjectHighlightsController,
      ClipperProjectHandoffsController,
      ClipperProjectPublicToolController,
      ClipperProjectReferenceFramesController,
      ClipperProjectGenerationController,
      ClipperProjectsController,
    ]);
  });

  it('removes the moved handlers from the wildcard CRUD controller', () => {
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'createFromYoutube',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'analyzeYoutube',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'getHighlights',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'rewriteHighlight',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'generateClips',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'retryFailedClips',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'getHookClipApproval',
    );
    expect(ClipperProjectsController.prototype).not.toHaveProperty(
      'submitHookClipDecision',
    );
  });
});
