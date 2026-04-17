import { ResponseIdNormalizerInterceptor } from '@api/interceptors/response-id-normalizer.interceptor';
import {
  type CallHandler,
  type ExecutionContext,
  StreamableFile,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';

describe('ResponseIdNormalizerInterceptor', () => {
  let interceptor: ResponseIdNormalizerInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  const interceptResult = async <T>(payload: T): Promise<T> => {
    mockCallHandler.handle = vi.fn().mockReturnValue(of(payload));

    return (await firstValueFrom(
      interceptor.intercept(mockExecutionContext, mockCallHandler),
    )) as T;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseIdNormalizerInterceptor],
    }).compile();

    interceptor = module.get<ResponseIdNormalizerInterceptor>(
      ResponseIdNormalizerInterceptor,
    );

    mockExecutionContext = {
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getClass: vi.fn(),
      getHandler: vi.fn(),
      getType: vi.fn(),
      switchToHttp: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    } as ExecutionContext;

    mockCallHandler = {
      handle: vi.fn(),
    } as CallHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should be defined', () => {
      expect(interceptor).toBeDefined();
    });

    it('should map _id to id and remove _id', async () => {
      const response = { _id: 'mongo-id', name: 'Example' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: 'mongo-id', name: 'Example' });
      expect(result).not.toHaveProperty('_id');
    });

    it('should preserve existing id and ignore _id', async () => {
      const response = {
        _id: 'ignored-id',
        id: 'primary-id',
        name: 'Test',
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'primary-id',
        name: 'Test',
      });
    });
  });

  describe('nested structures', () => {
    it('should normalize nested objects', async () => {
      const response = {
        _id: 'root-id',
        nested: {
          _id: 'nested-id',
          value: 'test',
        },
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'root-id',
        nested: {
          id: 'nested-id',
          value: 'test',
        },
      });
    });

    it('should normalize arrays of objects', async () => {
      const response = {
        _id: 'root-id',
        items: [
          { _id: 'item-1', label: 'one' },
          { _id: 'item-2', label: 'two' },
        ],
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'root-id',
        items: [
          { id: 'item-1', label: 'one' },
          { id: 'item-2', label: 'two' },
        ],
      });
    });

    it('should preserve existing id in nested objects and ignore _id', async () => {
      const response = {
        _id: 'ignored-id',
        id: 'primary-id',
        items: [
          { _id: 'nested-1', label: 'one' },
          { _id: 'ignored-2', id: 'nested-2', label: 'two' },
        ],
        meta: {
          owner: { _id: 'owner-1' },
        },
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'primary-id',
        items: [
          { id: 'nested-1', label: 'one' },
          { id: 'nested-2', label: 'two' },
        ],
        meta: {
          owner: { id: 'owner-1' },
        },
      });
    });

    it('should handle deeply nested structures', async () => {
      const response = {
        _id: 'level-0',
        level1: {
          _id: 'level-1',
          level2: {
            _id: 'level-2',
            level3: {
              _id: 'level-3',
              value: 'deep',
            },
          },
        },
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'level-0',
        level1: {
          id: 'level-1',
          level2: {
            id: 'level-2',
            level3: {
              id: 'level-3',
              value: 'deep',
            },
          },
        },
      });
    });
  });

  describe('primitive and non-object payloads', () => {
    it('should pass through string payloads', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of('ok'));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBe('ok');
    });

    it('should pass through number payloads', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of(42));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBe(42);
    });

    it('should pass through boolean payloads', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of(true));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBe(true);
    });

    it('should pass through null payloads', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of(null));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBeNull();
    });

    it('should pass through undefined payloads', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of(undefined));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBeUndefined();
    });
  });

  describe('normalizeIdValue function', () => {
    it('should handle ObjectId with toHexString method', async () => {
      const objectId = '507f191e810c19729de860ee';
      const response = { _id: objectId, name: 'Test' };
      const result = await interceptResult<{ id?: string; name: string }>(
        response,
      );

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(result.id).toBe(objectId.toHexString());
    });

    it('should handle number _id values', async () => {
      const response = { _id: 12345, name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: '12345', name: 'Test' });
    });

    it('should handle bigint _id values', async () => {
      const response = { _id: BigInt(9007199254740991), name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: '9007199254740991', name: 'Test' });
    });

    it('should handle object with toString method as _id', async () => {
      const customObj = {
        toString() {
          return this.value;
        },
        value: 'custom-id',
      };
      const response = { _id: customObj, name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: 'custom-id', name: 'Test' });
    });

    it('should handle null _id values', async () => {
      const response = { _id: null, name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: null, name: 'Test' });
    });

    it('should handle undefined _id values', async () => {
      const response = { _id: undefined, name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: undefined, name: 'Test' });
    });

    it('should handle string _id values', async () => {
      const response = { _id: 'string-id', name: 'Test' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({ id: 'string-id', name: 'Test' });
    });
  });

  describe('shouldSkipNormalization function', () => {
    it('should skip Date objects', async () => {
      const now = new Date();
      const response = {
        _id: 'test-id',
        createdAt: now,
        name: 'Test',
      };
      const result = await interceptResult<{
        createdAt: Date;
        id?: string;
        name: string;
      }>(response);

      expect(result.createdAt).toBe(now);
      expect(result.createdAt instanceof Date).toBe(true);
    });

    it('should skip StreamableFile objects', async () => {
      const readable = {
        on: vi.fn(),
        pipe: vi.fn(),
      };
      const streamableFile = new StreamableFile(
        readable as unknown as NodeJS.ReadableStream,
      );
      const response = {
        _id: 'test-id',
        file: streamableFile,
        name: 'Test',
      };
      const result = await interceptResult<{
        file: StreamableFile;
        id?: string;
        name: string;
      }>(response);

      expect(result.file).toBe(streamableFile);
    });

    it('should skip Buffer objects', async () => {
      const buffer = Buffer.from('test data');
      const response = {
        _id: 'test-id',
        data: buffer,
        name: 'Test',
      };
      const result = await interceptResult<{
        data: Buffer;
        id?: string;
        name: string;
      }>(response);

      expect(result.data).toBe(buffer);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('should skip Map objects', async () => {
      const map = new Map([['key', 'value']]);
      const response = {
        _id: 'test-id',
        mapping: map,
        name: 'Test',
      };
      const result = await interceptResult<{
        id?: string;
        mapping: Map<string, string>;
        name: string;
      }>(response);

      expect(result.mapping).toBe(map);
      expect(result.mapping instanceof Map).toBe(true);
    });

    it('should skip Set objects', async () => {
      const set = new Set(['a', 'b', 'c']);
      const response = {
        _id: 'test-id',
        items: set,
        name: 'Test',
      };
      const result = await interceptResult<{
        id?: string;
        items: Set<string>;
        name: string;
      }>(response);

      expect(result.items).toBe(set);
      expect(result.items instanceof Set).toBe(true);
    });

    it('should skip ArrayBuffer objects', async () => {
      const arrayBuffer = new ArrayBuffer(8);
      const response = {
        _id: 'test-id',
        buffer: arrayBuffer,
        name: 'Test',
      };
      const result = await interceptResult<{
        buffer: ArrayBuffer;
        id?: string;
        name: string;
      }>(response);

      expect(result.buffer).toBe(arrayBuffer);
      expect(result.buffer instanceof ArrayBuffer).toBe(true);
    });

    it('should skip TypedArray (Uint8Array) objects', async () => {
      const typedArray = new Uint8Array([1, 2, 3, 4]);
      const response = {
        _id: 'test-id',
        bytes: typedArray,
        name: 'Test',
      };
      const result = await interceptResult<{
        bytes: Uint8Array;
        id?: string;
        name: string;
      }>(response);

      expect(result.bytes).toBe(typedArray);
      expect(result.bytes instanceof Uint8Array).toBe(true);
    });

    it('should skip TypedArray (Int32Array) objects', async () => {
      const typedArray = new Int32Array([1, 2, 3, 4]);
      const response = {
        _id: 'test-id',
        name: 'Test',
        numbers: typedArray,
      };
      const result = await interceptResult<{
        id?: string;
        name: string;
        numbers: Int32Array;
      }>(response);

      expect(result.numbers).toBe(typedArray);
      expect(result.numbers instanceof Int32Array).toBe(true);
    });
  });

  describe('circular reference handling', () => {
    it('should handle circular references without infinite loop', async () => {
      const obj: Record<string, unknown> = {
        _id: 'test-id',
        name: 'Test',
      };
      obj.self = obj;

      const result = await interceptResult<Record<string, unknown>>(obj);

      expect(result).toHaveProperty('id', 'test-id');
      expect(result).toHaveProperty('name', 'Test');
      expect(result.self).toBe(obj);
    });

    it('should handle mutually referencing objects', async () => {
      const objA: Record<string, unknown> = {
        _id: 'obj-a',
        name: 'A',
      };
      const objB: Record<string, unknown> = {
        _id: 'obj-b',
        name: 'B',
      };
      objA.ref = objB;
      objB.ref = objA;

      const result = await interceptResult<Record<string, unknown>>(objA);

      expect(result).toHaveProperty('id', 'obj-a');
      expect(result.ref).toHaveProperty('id', 'obj-b');
    });
  });

  describe('array handling', () => {
    it('should normalize arrays at root level', async () => {
      const response = [
        { _id: 'item-1', name: 'First' },
        { _id: 'item-2', name: 'Second' },
      ];
      const result = await interceptResult<{
        author: { id?: string };
        comments: Array<{ id?: string }>;
        createdAt: Date;
        id?: string;
      }>(response);

      expect(result).toEqual([
        { id: 'item-1', name: 'First' },
        { id: 'item-2', name: 'Second' },
      ]);
    });

    it('should handle arrays with mixed content types', async () => {
      const response = {
        _id: 'root',
        items: [
          { _id: 'obj-1', name: 'Object' },
          'string',
          42,
          null,
          { _id: 'obj-2', name: 'Another' },
        ],
      };
      const result = await interceptResult<{
        items: Array<{ id: string; name: string }>;
        page: number;
        total: number;
      }>(response);

      expect(result).toEqual({
        id: 'root',
        items: [
          { id: 'obj-1', name: 'Object' },
          'string',
          42,
          null,
          { id: 'obj-2', name: 'Another' },
        ],
      });
    });

    it('should handle empty arrays', async () => {
      const response = {
        _id: 'root',
        items: [],
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'root',
        items: [],
      });
    });

    it('should handle nested arrays', async () => {
      const response = {
        _id: 'root',
        matrix: [
          [{ _id: '1-1' }, { _id: '1-2' }],
          [{ _id: '2-1' }, { _id: '2-2' }],
        ],
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'root',
        matrix: [
          [{ id: '1-1' }, { id: '1-2' }],
          [{ id: '2-1' }, { id: '2-2' }],
        ],
      });
    });
  });

  describe('edge cases', () => {
    it('should handle objects with no _id property', async () => {
      const response = {
        name: 'Test',
        value: 123,
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        name: 'Test',
        value: 123,
      });
      expect(result).not.toHaveProperty('id');
    });

    it('should handle empty objects', async () => {
      const response = {};
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({});
    });

    it('should handle objects with both id and no _id', async () => {
      const response = {
        id: 'existing-id',
        name: 'Test',
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 'existing-id',
        name: 'Test',
      });
    });

    it('should handle objects with id set to empty string', async () => {
      const response = {
        _id: 'should-not-replace',
        id: '',
        name: 'Test',
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: '',
        name: 'Test',
      });
    });

    it('should handle objects with id set to 0', async () => {
      const response = {
        _id: 'should-not-replace',
        id: 0,
        name: 'Test',
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: 0,
        name: 'Test',
      });
    });

    it('should handle objects with id set to false', async () => {
      const response = {
        _id: 'should-not-replace',
        id: false,
        name: 'Test',
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        id: false,
        name: 'Test',
      });
    });

    it('should preserve other properties when normalizing _id', async () => {
      const response = {
        _id: 'test-id',
        active: true,
        count: 42,
        metadata: { key: 'value' },
        name: 'Test',
        tags: ['a', 'b'],
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual({
        active: true,
        count: 42,
        id: 'test-id',
        metadata: { key: 'value' },
        name: 'Test',
        tags: ['a', 'b'],
      });
    });
  });

  describe('complex real-world scenarios', () => {
    it('should normalize a typical MongoDB document response', async () => {
      const objectId = '507f191e810c19729de860ee';
      const userId = '507f191e810c19729de860ee';
      const response = {
        _id: objectId,
        author: {
          _id: userId,
          email: 'john@example.com',
          name: 'John Doe',
        },
        comments: [
          {
            _id: '507f191e810c19729de860ee',
            createdAt: new Date(),
            text: 'Great post!',
          },
          {
            _id: '507f191e810c19729de860ee',
            createdAt: new Date(),
            text: 'Thanks for sharing',
          },
        ],
        content: 'Hello world',
        createdAt: new Date(),
        title: 'Test Post',
        updatedAt: new Date(),
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toHaveProperty('id', objectId.toHexString());
      expect(result).not.toHaveProperty('_id');
      expect(result.author).toHaveProperty('id', userId.toHexString());
      expect(result.author).not.toHaveProperty('_id');
      expect(result.comments[0]).toHaveProperty('id');
      expect(result.comments[0]).not.toHaveProperty('_id');
      expect(result.comments[1]).toHaveProperty('id');
      expect(result.createdAt instanceof Date).toBe(true);
    });

    it('should normalize paginated response with items', async () => {
      const response = {
        hasMore: true,
        items: [
          { _id: 'item-1', name: 'First' },
          { _id: 'item-2', name: 'Second' },
          { _id: 'item-3', name: 'Third' },
        ],
        limit: 3,
        page: 1,
        total: 100,
      };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(response));

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result.items).toEqual([
        { id: 'item-1', name: 'First' },
        { id: 'item-2', name: 'Second' },
        { id: 'item-3', name: 'Third' },
      ]);
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);
    });
  });
});
