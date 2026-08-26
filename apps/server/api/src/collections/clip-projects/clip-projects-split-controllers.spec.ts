import { ClipProjectHandoffsController } from '@api/collections/clip-projects/clip-project-handoffs.controller';
import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
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

  it('preserves the shared clip-projects role guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectHighlightsController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClipProjectsController),
    ).toContain(RolesGuard);
  });

  it('preserves the clip-projects tag and bearer authentication metadata', () => {
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
      ClipProjectHighlightsController,
      ClipProjectHandoffsController,
      ClipProjectReferenceFramesController,
      ClipProjectsController,
    ]);
  });

  it('removes the moved handlers from the wildcard CRUD controller', () => {
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'getHighlights',
    );
    expect(ClipProjectsController.prototype).not.toHaveProperty(
      'rewriteHighlight',
    );
  });
});
