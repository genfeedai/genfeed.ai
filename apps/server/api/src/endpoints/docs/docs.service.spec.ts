import { DocsService } from '@api/endpoints/docs/docs.service';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';

describe('DocsService', () => {
  let service: DocsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocsService],
    }).compile();

    service = module.get<DocsService>(DocsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setOpenApiDocument / getOpenApiDocument', () => {
    it('should return an empty object before any document is set', () => {
      const result = service.getOpenApiDocument();
      expect(result).toEqual({});
    });

    it('should store and return the OpenAPI document', () => {
      const doc: Partial<OpenAPIObject> = {
        info: { title: 'Test API', version: '1.0.0' },
        openapi: '3.0.0',
        paths: {},
      };

      service.setOpenApiDocument(doc as OpenAPIObject);
      const result = service.getOpenApiDocument();

      expect(result).toEqual(doc);
    });

    it('should overwrite a previously set document', () => {
      const firstDoc = {
        info: { title: 'First', version: '1.0.0' },
        openapi: '3.0.0',
        paths: {},
      } as OpenAPIObject;
      const secondDoc = {
        info: { title: 'Second', version: '2.0.0' },
        openapi: '3.1.0',
        paths: {},
      } as OpenAPIObject;

      service.setOpenApiDocument(firstDoc);
      service.setOpenApiDocument(secondDoc);

      const result = service.getOpenApiDocument() as typeof secondDoc;
      expect(result.info.title).toBe('Second');
      expect(result.openapi).toBe('3.1.0');
    });

    it('should preserve components and tags in the stored document', () => {
      const doc = {
        components: { schemas: { User: { type: 'object' } } },
        info: { title: 'Rich API', version: '1.0.0' },
        openapi: '3.0.0',
        paths: { '/users': {} },
        tags: [{ name: 'Users' }],
      } as unknown as OpenAPIObject;

      service.setOpenApiDocument(doc);
      const result = service.getOpenApiDocument() as typeof doc;

      expect(result.components?.schemas?.User).toBeDefined();
      expect(result.tags).toHaveLength(1);
    });
  });

  describe('setGptActionsSpec / getGptActionsSpec', () => {
    it('should return an empty object before any spec is set', () => {
      const result = service.getGptActionsSpec();
      expect(result).toEqual({});
    });

    it('should store and return the GPT Actions spec', () => {
      const spec = {
        info: { title: 'GPT Actions', version: '1.0.0' },
        openapi: '3.1.0',
        paths: {
          '/v1/action': { post: { operationId: 'doAction' } },
        },
      };

      service.setGptActionsSpec(spec);
      const result = service.getGptActionsSpec();

      expect(result).toEqual(spec);
    });

    it('should overwrite a previously set GPT actions spec', () => {
      service.setGptActionsSpec({ version: 'v1' });
      service.setGptActionsSpec({ newKey: true, version: 'v2' });

      const result = service.getGptActionsSpec();
      expect(result).toEqual({ newKey: true, version: 'v2' });
    });

    it('should handle arbitrary key-value pairs in the spec', () => {
      const spec = {
        customField: 'value',
        nested: { deep: { value: 42 } },
        paths: {},
      };

      service.setGptActionsSpec(spec);
      const result = service.getGptActionsSpec() as typeof spec;

      expect(result.customField).toBe('value');
      expect(result.nested.deep.value).toBe(42);
    });
  });
});
