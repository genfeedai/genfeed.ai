import { describe, expect, it } from 'vitest';
import {
  API_KEY_SCOPE_PRESETS,
  CONNECT_GENFEED_VERIFICATION_METADATA_KEY,
  SELF_SERVICE_API_KEY_SCOPES,
} from './api-key-presets.constant';
import { API_KEY_SCOPE_OPTIONS } from './api-key-scope-labels.constant';

describe('API key scope presets', () => {
  it('reserves Connect Genfeed verification metadata for the server', () => {
    expect(CONNECT_GENFEED_VERIFICATION_METADATA_KEY).toBe('connectGenfeed');
  });

  it('keeps content creation draft-only with the legacy alias', () => {
    expect(API_KEY_SCOPE_PRESETS.content).toContain('posts:create');
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
        'posts:create',
        'posts:draft',
        'posts:schedule',
        'posts:approve',
        'posts:publish',
      ]),
    );
  });

  it('exposes every tier as a self-service contract exactly once', () => {
    for (const scope of [
      'posts:create',
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
          scopes: ['posts:create', 'posts:draft'],
        },
        { label: 'Post scheduling', scopes: ['posts:schedule'] },
        { label: 'Publish approvals', scopes: ['posts:approve'] },
        { label: 'Direct publishing', scopes: ['posts:publish'] },
      ]),
    );
  });
});
