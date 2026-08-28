import { ClipProjectGenerationController } from '@api/collections/clip-projects/clip-project-generation.controller';
import { ClipProjectHandoffsController } from '@api/collections/clip-projects/clip-project-handoffs.controller';
import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
import { ClipProjectIngestionController } from '@api/collections/clip-projects/clip-project-ingestion.controller';
import { ClipProjectPublicToolController } from '@api/collections/clip-projects/clip-project-public-tool.controller';
import { ClipProjectReferenceFramesController } from '@api/collections/clip-projects/clip-project-reference-frames.controller';
import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipProjectsModule } from '@api/collections/clip-projects/clip-projects.module';
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
      'ClipProjectsController.createFromYoutube',
      'YouTube → Clip Factory',
      'Create a clip project from a YouTube URL. Downloads audio, transcribes, detects highlights, and generates avatar or raw-cut clips asynchronously.',
    ],
    [
      'analyzeYoutube',
      'analyze',
      'ClipProjectsController.analyzeYoutube',
      'Analyze YouTube video for highlights',
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Cheap step (1 credit). Returns projectId to poll for results.',
    ],
  ] as const)(
    'preserves %s ingestion route and metadata',
    (methodName, path, operationId, summary, description) => {
      const handler = Reflect.get(
        ClipProjectIngestionController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipProjectIngestionController),
      ).toBe('clip-projects');
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
      'ClipProjectsController.getHighlights',
    ],
    [
      'rewriteHighlight',
      ':projectId/highlights/:highlightId/rewrite',
      RequestMethod.POST,
      'ClipProjectsController.rewriteHighlight',
    ],
  ] as const)(
    'preserves %s route and OpenAPI metadata',
    (methodName, path, method, operationId) => {
      const handler = Reflect.get(
        ClipProjectHighlightsController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipProjectHighlightsController),
      ).toBe('clip-projects');
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
        ClipProjectHighlightsController.prototype.rewriteHighlight,
      ),
    ).toBe(HttpStatus.OK);
  });

  it.each([
    [
      'generateClips',
      ':projectId/generate',
      RequestMethod.POST,
      HttpStatus.ACCEPTED,
      'ClipProjectsController.generateClips',
    ],
    [
      'retryFailedClips',
      ':projectId/retry-failed',
      RequestMethod.POST,
      HttpStatus.ACCEPTED,
      'ClipProjectsController.retryFailedClips',
    ],
    [
      'getHookClipApproval',
      ':projectId/hook-approval',
      RequestMethod.GET,
      undefined,
      'ClipProjectsController.getHookClipApproval',
    ],
    [
      'submitHookClipDecision',
      ':projectId/hook-approval',
      RequestMethod.POST,
      HttpStatus.OK,
      'ClipProjectsController.submitHookClipDecision',
    ],
  ] as const)(
    'preserves %s generation route and OpenAPI metadata',
    (methodName, path, method, httpCode, operationId) => {
      const handler = Reflect.get(
        ClipProjectGenerationController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, ClipProjectGenerationController),
      ).toBe('clip-projects');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(httpCode);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId });
    },
  );

  it('preserves the shared clip-projects role guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectIngestionController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectHighlightsController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectGenerationController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectsController),
    ).toContain(RolesGuard);
  });

  it('preserves the clip-projects tag and bearer authentication metadata', () => {
    expect(
      Reflect.getMetadata('swagger/apiUseTags', ClipProjectIngestionController),
    ).toEqual(['clip-projects']);
    expect(
      Reflect.getMetadata(
        'swagger/apiSecurity',
        ClipProjectIngestionController,
      ),
    ).toEqual([{ bearer: [] }]);
    expect(
      Reflect.getMetadata(
        'swagger/apiUseTags',
        ClipProjectHighlightsController,
      ),
    ).toEqual(['clip-projects']);
    expect(
      Reflect.getMetadata(
        'swagger/apiSecurity',
        ClipProjectHighlightsController,
      ),
    ).toEqual([{ bearer: [] }]);
  });

  it('registers static sibling controllers before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ClipProjectsModule),
    ).toEqual([
      ClipProjectIngestionController,
      ClipProjectHighlightsController,
      ClipProjectHandoffsController,
      ClipProjectPublicToolController,
      ClipProjectReferenceFramesController,
      ClipProjectGenerationController,
      ClipProjectsController,
    ]);
  });

  it('removes the moved handlers from the wildcard CRUD controller', () => {
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'createFromYoutube',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'analyzeYoutube',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'getHighlights',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'rewriteHighlight',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'generateClips',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'retryFailedClips',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'getHookClipApproval',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'submitHookClipDecision',
    );
  });
});
