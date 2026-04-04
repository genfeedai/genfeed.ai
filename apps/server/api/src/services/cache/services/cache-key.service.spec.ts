import { CacheKeyService } from '@api/services/cache/services/cache-key.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('CacheKeyService', () => {
  let service: CacheKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheKeyService],
    }).compile();

    service = module.get<CacheKeyService>(CacheKeyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate a key with namespace and single part', () => {
    const key = service.generate('users', 'abc123');
    expect(key).toBe('users:abc123');
  });

  it('should generate a key with namespace and multiple string parts', () => {
    const key = service.generate('cache', 'org', 'brand', 'posts');
    expect(key).toBe('cache:org:brand:posts');
  });

  it('should generate a key with numeric parts', () => {
    const key = service.generate('rate-limit', 42, 100);
    expect(key).toBe('rate-limit:42:100');
  });

  it('should generate a key with mixed string and number parts', () => {
    const key = service.generate('quota', 'org123', 7);
    expect(key).toBe('quota:org123:7');
  });

  it('should generate a key with only namespace when no parts provided', () => {
    const key = service.generate('standalone');
    expect(key).toBe('standalone:');
  });

  it('should handle empty string parts', () => {
    const key = service.generate('ns', '', 'end');
    expect(key).toBe('ns::end');
  });

  it('should handle zero as a part', () => {
    const key = service.generate('counter', 0);
    expect(key).toBe('counter:0');
  });

  it('should produce deterministic keys for the same inputs', () => {
    const key1 = service.generate('test', 'a', 'b');
    const key2 = service.generate('test', 'a', 'b');
    expect(key1).toBe(key2);
  });

  it('should produce different keys for different namespaces', () => {
    const key1 = service.generate('ns1', 'id');
    const key2 = service.generate('ns2', 'id');
    expect(key1).not.toBe(key2);
  });
});
