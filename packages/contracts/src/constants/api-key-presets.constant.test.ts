import { describe, expect, it } from 'vitest';
import {
  API_KEY_SCOPE_PRESETS,
  apiKeyAllowedBrandsMetadata,
  CONNECT_GENFEED_VERIFICATION_METADATA_KEY,
  readApiKeyAllowedBrandIds,
  SELF_SERVICE_API_KEY_SCOPES,
} from './api-key-presets.constant';
import { API_KEY_SCOPE_OPTIONS } from './api-key-scope-labels.constant';

describe('API key scope presets', () => {
  it('reserves Connect Genfeed verification metadata for the server', () => {
    expect(CONNECT_GENFEED_VERIFICATION_METADATA_KEY).toBe('connectGenfeed');
  });

  it('keeps content creation draft-only', () => {
    expect(API_KEY_SCOPE_PRESETS.content).toContain('posts:draft');
    expect(API_KEY_SCOPE_PRESETS.content).not.toContain('posts:schedule');
    expect(API_KEY_SCOPE_PRESETS.content).not.toContain('posts:approve');
    expect(API_KEY_SCOPE_PRESETS.content).not.toContain('posts:publish');
  });

  it('defaults MCP publishing to approval-first capabilities', () => {
    expect(API_KEY_SCOPE_PRESETS.mcp).toContain('posts:draft');
    expect(API_KEY_SCOPE_PRESETS.mcp).toContain('posts:schedule');
    expect(API_KEY_SCOPE_PRESETS.mcp).toContain('posts:approve');
    expect(API_KEY_SCOPE_PRESETS.mcp).not.toContain('posts:publish');
  });

  it('reserves direct publishing for an explicitly full key', () => {
    expect(API_KEY_SCOPE_PRESETS.full).toEqual(
      expect.arrayContaining([
        'posts:draft',
        'posts:schedule',
        'posts:approve',
        'posts:publish',
      ]),
    );
  });

  it('exposes every tier as a self-service contract exactly once', () => {
    for (const scope of [
      'posts:draft',
      'posts:schedule',
      'posts:approve',
      'posts:publish',
    ]) {
      expect(
        SELF_SERVICE_API_KEY_SCOPES.filter((item) => item === scope),
      ).toHaveLength(1);
    }
  });

  it('keeps direct publishing independently selectable', () => {
    expect(API_KEY_SCOPE_OPTIONS).toEqual(
      expect.arrayContaining([
        {
          label: 'Post drafts',
          scopes: ['posts:draft'],
        },
        { label: 'Post scheduling', scopes: ['posts:schedule'] },
        { label: 'Publish approvals', scopes: ['posts:approve'] },
        { label: 'Direct publishing', scopes: ['posts:publish'] },
      ]),
    );
  });
});

describe('readApiKeyAllowedBrandIds', () => {
  it.each([
    ['no metadata', null, undefined],
    ['metadata without a list', { kind: 'partner' }, undefined],
    [
      'a list',
      { allowedBrandIds: ['brand-1', 'brand-2'] },
      ['brand-1', 'brand-2'],
    ],
    ['a malformed list, failing closed', { allowedBrandIds: 'brand-1' }, []],
    [
      'non-string entries dropped',
      { allowedBrandIds: ['brand-1', 7, ''] },
      ['brand-1'],
    ],
  ])('reads %s', (_case, metadata, expected) => {
    expect(readApiKeyAllowedBrandIds(metadata)).toEqual(expected);
  });
});

describe('apiKeyAllowedBrandsMetadata', () => {
  it.each([
    ['a key without a limit', { kind: 'partner' }, {}],
    [
      'a limited key',
      { allowedBrandIds: ['brand-1'], kind: 'partner' },
      { allowedBrandIds: ['brand-1'] },
    ],
    [
      'a malformed limit, failing closed',
      { allowedBrandIds: 'brand-1' },
      { allowedBrandIds: [] },
    ],
  ])('carries over the limit of %s', (_case, metadata, expected) => {
    expect(apiKeyAllowedBrandsMetadata(metadata)).toEqual(expected);
  });
});
