import { describe, expect, it } from 'vitest';
import {
  buildGeneratedMcpTools,
  collectGeneratedOperations,
  dereferenceSchema,
  deriveToolName,
  splitOperationId,
  toSnakeCase,
} from './build-generated-mcp-tools.js';
import type { IOpenApiDocument, IOpenApiSchema } from './openapi-types.js';

const INTERNAL = ['/health'];

const DOCUMENT: IOpenApiDocument = {
  components: {
    schemas: {
      CreateWidgetDto: {
        properties: {
          owner: { $ref: '#/components/schemas/OwnerDto' },
          tags: { items: { type: 'string' }, type: 'array' },
          title: { description: 'Widget title', type: 'string' },
        },
        required: ['title'],
        type: 'object',
      },
      // Self-referential to exercise the cycle guard.
      OwnerDto: {
        properties: {
          id: { type: 'string' },
          manager: { $ref: '#/components/schemas/OwnerDto' },
        },
        type: 'object',
      },
    },
  },
  paths: {
    '/health': {
      get: { operationId: 'HealthController.check', summary: 'check' },
    },
    '/widgets': {
      get: {
        operationId: 'WidgetsController.findAll',
        parameters: [
          {
            description: 'Page number',
            in: 'query',
            name: 'page',
            required: false,
            schema: { default: 1, type: 'number' },
          },
          {
            in: 'query',
            name: 'q',
            required: true,
            schema: { type: 'string' },
          },
        ],
        summary: 'findAll',
        tags: ['widgets'],
      },
      post: {
        operationId: 'WidgetsController.create',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWidgetDto' },
            },
          },
          required: true,
        },
        summary: 'create',
        tags: ['widgets'],
      },
    },
    '/widgets/{widgetId}': {
      get: {
        operationId: 'WidgetsController.findOne',
        parameters: [
          {
            in: 'path',
            name: 'widgetId',
            required: true,
            schema: { type: 'string' },
          },
        ],
        summary: 'findOne',
        tags: ['widgets'],
      },
    },
  },
};

describe('toSnakeCase', () => {
  it.each([
    ['findAll', 'find_all'],
    ['BrandsController', 'brands_controller'],
    ['getHTMLData', 'get_html_data'],
    ['oauth2Callback', 'oauth2_callback'],
    ['bulkUpdate', 'bulk_update'],
  ])('snake-cases %s → %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });
});

describe('splitOperationId / deriveToolName', () => {
  it('strips the Controller suffix and snake-cases both halves', () => {
    expect(splitOperationId('BrandsController.bulkUpdate')).toEqual({
      action: 'bulk_update',
      domain: 'brands',
    });
    expect(deriveToolName('BrandsController.bulkUpdate')).toBe(
      'brands__bulk_update',
    );
  });

  it('falls back to the api domain when there is no dot (name still carries __)', () => {
    expect(deriveToolName('weirdOperation')).toBe('api__weird_operation');
  });
});

describe('dereferenceSchema', () => {
  it('inlines a $ref and breaks self-referential cycles', () => {
    const components = DOCUMENT.components?.schemas as Record<
      string,
      IOpenApiSchema
    >;
    const resolved = dereferenceSchema(
      { $ref: '#/components/schemas/OwnerDto' },
      components,
    ) as Record<string, unknown>;

    expect(resolved.type).toBe('object');
    const properties = resolved.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties.id).toEqual({ type: 'string' });
    // The recursive `manager` ref must be collapsed, not expanded forever.
    expect(properties.manager).toEqual({
      description: 'Circular reference to OwnerDto',
      type: 'object',
    });
  });

  it('replaces an unknown $ref with an opaque object', () => {
    expect(
      dereferenceSchema({ $ref: '#/components/schemas/Missing' }, {}),
    ).toEqual({ type: 'object' });
  });
});

describe('collectGeneratedOperations', () => {
  it('excludes internal routes and yields deterministic ordering', () => {
    const operations = collectGeneratedOperations(DOCUMENT, INTERNAL);
    expect(operations.map((operation) => operation.toolName)).toEqual([
      'widgets__find_all',
      'widgets__create',
      'widgets__find_one',
    ]);
    expect(operations.some((operation) => operation.path === '/health')).toBe(
      false,
    );
  });
});

describe('buildGeneratedMcpTools', () => {
  const tools = buildGeneratedMcpTools(DOCUMENT, INTERNAL);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  it('maps every non-internal operation, sorted by name', () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'widgets__create',
      'widgets__find_all',
      'widgets__find_one',
    ]);
  });

  it('marks every tool mcp-only with the domain in tags', () => {
    for (const tool of tools) {
      expect(tool.surfaces).toEqual({
        agent: false,
        cliAgentVisible: false,
        mcp: true,
      });
      expect(tool.category).toBe('other');
      expect(tool.creditCost).toBe(0);
      expect(tool.requiredRole).toBe('user');
      expect(tool.tags).toEqual(['widgets']);
    }
  });

  it('flattens query parameters for a read, preserving schema + required', () => {
    const tool = byName.get('widgets__find_all');
    expect(tool?.description).toBe('findAll (GET /widgets)');
    expect(tool?.parameters.properties.page).toEqual({
      default: 1,
      description: 'Page number',
      type: 'number',
    });
    expect(tool?.parameters.required).toEqual(['q']);
  });

  it('dereferences and flattens the request body for a write', () => {
    const tool = byName.get('widgets__create');
    const properties = tool?.parameters.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(['owner', 'tags', 'title']);
    expect(properties.title).toEqual({
      description: 'Widget title',
      type: 'string',
    });
    // owner was a $ref that must be inlined.
    expect((properties.owner as Record<string, unknown>).type).toBe('object');
    // Only the DTO's own required list carries over.
    expect(tool?.parameters.required).toEqual(['title']);
  });

  it('makes a path parameter a required property', () => {
    const tool = byName.get('widgets__find_one');
    expect(Object.keys(tool?.parameters.properties ?? {})).toEqual([
      'widgetId',
    ]);
    expect(tool?.parameters.required).toEqual(['widgetId']);
  });

  it('regenerates deterministically (same input → structurally identical)', () => {
    expect(buildGeneratedMcpTools(DOCUMENT, INTERNAL)).toEqual(
      buildGeneratedMcpTools(DOCUMENT, INTERNAL),
    );
  });

  it('throws when two operations derive the same tool name', () => {
    const collidingDoc: IOpenApiDocument = {
      paths: {
        '/a': { get: { operationId: 'WidgetsController.findAll' } },
        '/b': { get: { operationId: 'WidgetsController.findAll' } },
      },
    };
    expect(() => buildGeneratedMcpTools(collidingDoc, [])).toThrow(
      /collision/i,
    );
  });

  it('throws when a body property collides with a path/query parameter', () => {
    const collidingDoc: IOpenApiDocument = {
      components: {
        schemas: {
          Dto: { properties: { id: { type: 'string' } }, type: 'object' },
        },
      },
      paths: {
        '/things/{id}': {
          post: {
            operationId: 'ThingsController.create',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Dto' },
                },
              },
              required: true,
            },
          },
        },
      },
    };
    expect(() => buildGeneratedMcpTools(collidingDoc, [])).toThrow(/collides/);
  });
});
