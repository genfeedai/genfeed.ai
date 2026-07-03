import { Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  buildStableOpenApiDocument,
  createOpenApiBuilderOptions,
  OPENAPI_ARTIFACT_INFO,
  serializeOpenApiDocument,
  sortKeysDeep,
  stableOperationIdFactory,
} from './openapi-document.util';

@Controller('spec-fixture-widgets')
class SpecFixtureWidgetsController {
  @Get()
  findAll(): string[] {
    return [];
  }

  @Post()
  create(): string {
    return 'created';
  }
}

@Controller('spec-fixture-gadgets')
class SpecFixtureGadgetsController {
  @Get()
  findAll(): string[] {
    return [];
  }
}

describe('stableOperationIdFactory', () => {
  it('derives operationId from controller class and method name', () => {
    expect(stableOperationIdFactory('BrandsController', 'findAll')).toBe(
      'BrandsController.findAll',
    );
  });
});

describe('sortKeysDeep', () => {
  it('sorts object keys recursively', () => {
    const input = { b: { d: 1, c: 2 }, a: 3 };
    expect(JSON.stringify(sortKeysDeep(input))).toBe(
      '{"a":3,"b":{"c":2,"d":1}}',
    );
  });

  it('preserves array order while sorting element keys', () => {
    const input = { list: [{ b: 1, a: 2 }, { z: 3 }] };
    expect(JSON.stringify(sortKeysDeep(input))).toBe(
      '{"list":[{"a":2,"b":1},{"z":3}]}',
    );
  });

  it('passes through primitives and null', () => {
    expect(sortKeysDeep(null)).toBeNull();
    expect(sortKeysDeep(42)).toBe(42);
    expect(sortKeysDeep('x')).toBe('x');
  });
});

describe('serializeOpenApiDocument', () => {
  it('produces identical bytes regardless of input key order', () => {
    const first = {
      info: { title: 'T', version: '1' },
      openapi: '3.0.0',
      paths: { '/b': {}, '/a': {} },
    };
    const second = {
      paths: { '/a': {}, '/b': {} },
      openapi: '3.0.0',
      info: { version: '1', title: 'T' },
    };

    const serializedFirst = serializeOpenApiDocument(
      first as unknown as Parameters<typeof serializeOpenApiDocument>[0],
    );
    const serializedSecond = serializeOpenApiDocument(
      second as unknown as Parameters<typeof serializeOpenApiDocument>[0],
    );

    expect(serializedFirst).toBe(serializedSecond);
    expect(serializedFirst.endsWith('\n')).toBe(true);
  });
});

describe('buildStableOpenApiDocument', () => {
  it('assigns stable operationIds to every route and sorts document keys', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SpecFixtureWidgetsController, SpecFixtureGadgetsController],
    }).compile();
    const app = moduleRef.createNestApplication();

    const document = buildStableOpenApiDocument(
      app,
      createOpenApiBuilderOptions(OPENAPI_ARTIFACT_INFO),
    );

    const widgetOperations = document.paths['/spec-fixture-widgets'];
    expect(widgetOperations?.get?.operationId).toBe(
      'SpecFixtureWidgetsController.findAll',
    );
    expect(widgetOperations?.post?.operationId).toBe(
      'SpecFixtureWidgetsController.create',
    );
    expect(document.paths['/spec-fixture-gadgets']?.get?.operationId).toBe(
      'SpecFixtureGadgetsController.findAll',
    );

    expect(Object.keys(document.paths)).toEqual(
      [...Object.keys(document.paths)].sort(),
    );

    const rebuilt = buildStableOpenApiDocument(
      app,
      createOpenApiBuilderOptions(OPENAPI_ARTIFACT_INFO),
    );
    expect(serializeOpenApiDocument(rebuilt)).toBe(
      serializeOpenApiDocument(document),
    );

    await app.close();
  });
});
