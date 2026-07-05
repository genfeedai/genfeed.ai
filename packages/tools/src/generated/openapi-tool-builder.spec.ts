import { describe, expect, it } from 'vitest';
import type {
  JsonSchema,
  OpenApiOperation,
} from './openapi-tool-builder.js';
import {
  buildOperation,
  deriveToolName,
  simplifyPropertySchema,
  toSnake,
} from './openapi-tool-builder.js';
import { isInternalRoute } from './internal-routes.allowlist.js';

describe('deriveToolName', () => {
  it('snake-cases the controller and method with an api_ namespace', () => {
    expect(deriveToolName('ActivitiesController.update')).toBe(
      'api_activities_update',
    );
    expect(deriveToolName('AiInfluencerController.generatePost')).toBe(
      'api_ai_influencer_generate_post',
    );
    expect(deriveToolName('ClipProjectsController.findAll')).toBe(
      'api_clip_projects_find_all',
    );
  });

  it('produces names within the 64-char MCP limit', () => {
    const long =
      'ExtremelyLongSubscriptionAttributionAnalyticsController.getContentSubscriptionRetentionStatsBreakdown';
    const name = deriveToolName(long);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name.startsWith('api_')).toBe(true);
  });

  it('is deterministic for the same operationId', () => {
    const id = 'FooController.bar';
    expect(deriveToolName(id)).toBe(deriveToolName(id));
  });
});

describe('toSnake', () => {
  it('handles camelCase, PascalCase and kebab-case', () => {
    expect(toSnake('generatePost')).toBe('generate_post');
    expect(toSnake('AiInfluencer')).toBe('ai_influencer');
    expect(toSnake('some-kebab-name')).toBe('some_kebab_name');
  });
});

describe('simplifyPropertySchema', () => {
  it('flattens a nested $ref to a generic object', () => {
    expect(simplifyPropertySchema({ $ref: '#/components/schemas/BrandDto' })).toEqual(
      { description: 'Object (BrandDto)', type: 'object' },
    );
  });

  it('preserves primitive type, description and enum', () => {
    expect(
      simplifyPropertySchema({
        type: 'string',
        description: 'A status',
        enum: ['a', 'b'],
      }),
    ).toEqual({ type: 'string', description: 'A status', enum: ['a', 'b'] });
  });

  it('shallow-types array items', () => {
    expect(simplifyPropertySchema({ type: 'array', items: { type: 'string' } })).toEqual(
      { type: 'array', items: { type: 'string' } },
    );
  });
});

describe('buildOperation', () => {
  const schemas: Record<string, JsonSchema> = {
    BulkUpdateDto: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        isRead: { type: 'boolean' },
      },
      required: ['ids'],
    },
  };

  it('binds a GET with a path parameter as a read route', () => {
    const op: OpenApiOperation = {
      operationId: 'ActivitiesController.findOne',
      summary: 'Get one activity',
      tags: ['Activities'],
      parameters: [
        { name: 'activityId', in: 'path', required: true, schema: { type: 'string' } },
      ],
    };
    const { tool, route } = buildOperation('/activities/{activityId}', 'get', op, schemas);

    expect(route.method).toBe('get');
    expect(route.isWrite).toBe(false);
    expect(route.pathParams).toEqual(['activityId']);
    expect(route.bodyMode).toBe('none');
    expect(tool.surfaces.mcp).toBe(true);
    expect(tool.surfaces.agent).toBe(false);
    expect(tool.parameters.required).toContain('activityId');
    expect(tool.description).toBe('[API] Get one activity');
  });

  it('flattens an object DTO body into top-level args (flat mode)', () => {
    const op: OpenApiOperation = {
      operationId: 'ActivitiesController.bulkUpdate',
      summary: 'Bulk update',
      tags: ['Activities'],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/BulkUpdateDto' } },
        },
      },
    };
    const { tool, route } = buildOperation('/activities', 'patch', op, schemas);

    expect(route.method).toBe('patch');
    expect(route.isWrite).toBe(true);
    expect(route.bodyMode).toBe('flat');
    expect(route.bodyParams).toEqual(['ids', 'isRead']);
    expect(tool.parameters.required).toContain('ids');
    expect(tool.parameters.required).not.toContain('isRead');
    expect(Object.keys(tool.parameters.properties)).toEqual(['ids', 'isRead']);
  });

  it('uses raw body mode for a non-object (array) request schema', () => {
    const op: OpenApiOperation = {
      operationId: 'ThingsController.bulkCreate',
      tags: ['Things'],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } },
      },
    };
    const { tool, route } = buildOperation('/things', 'post', op, schemas);

    expect(route.bodyMode).toBe('raw');
    expect(route.bodyParams).toEqual([]);
    expect(tool.parameters.properties.body).toBeDefined();
    expect(tool.parameters.required).toContain('body');
  });

  it('keeps path/query/body arg locations disjoint (path wins name clash)', () => {
    const clashSchemas: Record<string, JsonSchema> = {
      Dto: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } } },
    };
    const op: OpenApiOperation = {
      operationId: 'NotesController.update',
      tags: ['Notes'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Dto' } } },
      },
    };
    const { route } = buildOperation('/notes/{id}', 'patch', op, clashSchemas);

    // `id` is a path param, so it must NOT also appear as a body param.
    expect(route.pathParams).toEqual(['id']);
    expect(route.bodyParams).toEqual(['note']);
  });

  it('falls back to METHOD path for description when no summary', () => {
    const op: OpenApiOperation = { operationId: 'X.y', tags: ['X'] };
    const { tool } = buildOperation('/x', 'delete', op, schemas);
    expect(tool.description).toBe('[API] DELETE /x');
  });
});

describe('isInternalRoute', () => {
  it('excludes health, webhooks, callbacks, auth and docs', () => {
    expect(isInternalRoute({ path: '/health', method: 'get', tags: [] })).toBe(true);
    expect(isInternalRoute({ path: '/webhooks/stripe', method: 'post', tags: [] })).toBe(true);
    expect(isInternalRoute({ path: '/integrations/x/callback', method: 'get', tags: [] })).toBe(true);
    expect(isInternalRoute({ path: '/auth/session', method: 'get', tags: [] })).toBe(true);
    expect(isInternalRoute({ path: '/anything', method: 'get', tags: ['Health'] })).toBe(true);
  });

  it('keeps ordinary product routes', () => {
    expect(isInternalRoute({ path: '/clip-projects', method: 'post', tags: ['Clip Projects'] })).toBe(false);
    expect(isInternalRoute({ path: '/activities/{activityId}', method: 'get', tags: ['Activities'] })).toBe(false);
  });
});
