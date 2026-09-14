import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

class OptionalService {}

describe('resolveOptionalProvider', () => {
  it('returns undefined when ModuleRef is absent', () => {
    expect(resolveOptionalProvider(undefined, OptionalService)).toBeUndefined();
  });

  it.each([OptionalService, 'optional-service', Symbol('optional-service')])(
    'resolves a registered class, string or symbol token',
    async (token) => {
      const instance = new OptionalService();
      const module = await Test.createTestingModule({
        providers: [{ provide: token, useValue: instance }],
      }).compile();
      try {
        expect(resolveOptionalProvider(module.get(ModuleRef), token)).toBe(
          instance,
        );
      } finally {
        await module.close();
      }
    },
  );

  it('returns undefined when an optional provider is absent', async () => {
    const module = await Test.createTestingModule({}).compile();
    try {
      expect(
        resolveOptionalProvider(module.get(ModuleRef), OptionalService),
      ).toBeUndefined();
    } finally {
      await module.close();
    }
  });
});
