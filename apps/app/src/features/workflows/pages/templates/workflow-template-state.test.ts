import { describe, expect, it } from 'vitest';
import type { SystemWorkflowCatalogEntry } from '@/features/workflows/services/workflow-api';
import { initialState, pageReducer } from './workflow-template-state';

const entry: SystemWorkflowCatalogEntry = {
  canonicalId: 'official',
  category: 'content',
  changeSummary: 'Initial',
  description: 'Summarize stories',
  family: 'content',
  installable: true,
  installed: false,
  installedWorkflowId: null,
  isScheduleEnabled: false,
  label: 'Digest',
  sourceIssue: 1,
  version: 1,
};

describe('workflow template page state', () => {
  it('settles the catalog independently of featured and retains data during a scoped retry', () => {
    const loaded = pageReducer(initialState, {
      type: 'CATALOG_LOADED',
      systemCatalog: [entry],
    });
    expect(loaded.hasSettled).toBe(false);
    const settled = pageReducer(loaded, {
      type: 'LOAD_FAILED',
      source: 'templates',
    });
    expect(settled.hasSettled).toBe(true);
    expect(settled.sourceStatus.featured).toBe('loading');
    const retrying = pageReducer(settled, {
      type: 'LOAD_START',
      sources: ['templates'],
    });
    expect(retrying).toMatchObject({
      hasSettled: true,
      systemCatalog: [entry],
      sourceStatus: { templates: 'loading', systemCatalog: 'ready' },
    });
    expect(settled.sourceStatus.templates).toBe('error');
  });

  it('keeps selection and search independent until clear filters', () => {
    let state = pageReducer(initialState, {
      type: 'SET_SEARCH',
      searchQuery: 'Digest',
    });
    state = pageReducer(state, { type: 'SET_CATEGORY', category: 'content' });
    state = pageReducer(state, { type: 'SET_SOURCE', source: 'installed' });
    expect(state).toMatchObject({
      searchQuery: 'Digest',
      selectedCategory: 'content',
      selectedSource: 'installed',
    });
    expect(pageReducer(state, { type: 'CLEAR_FILTERS' })).toMatchObject({
      searchQuery: '',
      selectedCategory: 'all',
      selectedSource: 'all',
    });
  });

  it('updates only the installed official workflow without mutating the prior catalog', () => {
    const loaded = pageReducer(initialState, {
      type: 'CATALOG_LOADED',
      systemCatalog: [entry, { ...entry, canonicalId: 'other' }],
    });
    const started = pageReducer(loaded, {
      type: 'INSTALL_START',
      canonicalId: entry.canonicalId,
    });
    expect(started.installingCanonicalId).toBe('official');
    const installed = pageReducer(started, {
      type: 'INSTALL_SUCCESS',
      canonicalId: 'official',
      installedWorkflowId: 'copy-1',
    });
    expect(installed.installingCanonicalId).toBeNull();
    expect(installed.systemCatalog[0]).toMatchObject({
      installed: true,
      installedWorkflowId: 'copy-1',
    });
    expect(installed.systemCatalog[1].installed).toBe(false);
    expect(loaded.systemCatalog[0].installed).toBe(false);
  });

  it('cancels bootstrap errors while preserving errors from install or copy actions', () => {
    const failed = pageReducer(initialState, {
      type: 'BOOTSTRAP_ERROR',
      error: { key: 'bootstrap', detail: 'Retry' },
    });
    expect(
      pageReducer(failed, { type: 'BOOTSTRAP_CANCEL' }).actionError,
    ).toBeNull();
    for (const key of ['install', 'copyFeatured'] as const) {
      const state = { ...initialState, actionError: { key, detail: 'Keep' } };
      expect(
        pageReducer(state, { type: 'BOOTSTRAP_CANCEL' }).actionError,
      ).toEqual(state.actionError);
    }
  });

  it('resets progress and stores localized error keys when actions fail', () => {
    const installing = pageReducer(initialState, {
      type: 'INSTALL_START',
      canonicalId: 'official',
    });
    expect(
      pageReducer(installing, {
        type: 'INSTALL_ERROR',
        error: { key: 'install' },
      }),
    ).toMatchObject({
      installingCanonicalId: null,
      actionError: { key: 'install' },
    });
    const copying = pageReducer(initialState, {
      type: 'COPY_FEATURED_START',
      workflowId: 'pin',
    });
    expect(copying.copyingFeaturedWorkflowId).toBe('pin');
    expect(
      pageReducer(copying, {
        type: 'COPY_FEATURED_ERROR',
        error: { key: 'copyFeatured' },
      }),
    ).toMatchObject({
      copyingFeaturedWorkflowId: null,
      actionError: { key: 'copyFeatured' },
    });
  });
});
