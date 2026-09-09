import { describe, expect, it } from 'vitest';
import { resolvePageHelpKey, stripScopePrefix } from './page-help.config';

describe('page help routing', () => {
  it('strips the org and brand scope', () => {
    expect(stripScopePrefix('/acme/brand/automation/runs')).toBe(
      '/automation/runs',
    );
    expect(stripScopePrefix('/acme/~/analytics/overview')).toBe(
      '/analytics/overview',
    );
  });

  it('picks the longest matching prefix', () => {
    expect(resolvePageHelpKey('/acme/brand/automation/autopilot')).toBe(
      'automationAgents',
    );
    expect(resolvePageHelpKey('/acme/brand/library/trash')).toBe(
      'libraryTrash',
    );
    expect(resolvePageHelpKey('/acme/brand/library/images')).toBe('library');
    expect(resolvePageHelpKey('/acme/brand/automation/workflows/new')).toBe(
      'automationWorkflows',
    );
  });

  it('returns null for pages without help copy', () => {
    expect(resolvePageHelpKey('/acme/brand/settings/general')).toBeNull();
  });
});
