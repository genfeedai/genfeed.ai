import { describe, expect, it } from 'vitest';
import type {
  FeaturedWorkflow,
  SystemWorkflowCatalogEntry,
  WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';
import {
  buildCatalogItems,
  buildFeaturedItems,
  buildShowcaseFeaturedItems,
  buildTypeTiles,
  filterCatalogItems,
  isCatalogSource,
} from './workflow-template-catalog';

const template: WorkflowTemplate = {
  id: 'starter',
  name: 'Social launch',
  description: 'Prepare channel posts',
  category: 'social',
};
const systemEntry: SystemWorkflowCatalogEntry = {
  canonicalId: 'official',
  category: 'content',
  changeSummary: 'Initial',
  description: 'Summarize stories',
  family: 'content',
  installable: true,
  installed: false,
  installedWorkflowId: null,
  isScheduleEnabled: false,
  label: 'Daily digest',
  sourceIssue: 1,
  version: 1,
};
const href = (path: string) => `/fixture${path}`;

function catalog() {
  return buildCatalogItems({
    href,
    templates: [template],
    systemCatalog: [systemEntry],
  });
}

describe('workflow template catalog', () => {
  it('deduplicates official templates and preserves stable starter order after ranked showcase items', () => {
    const items = buildCatalogItems({
      href,
      templates: [
        template,
        { ...template, id: 'second' },
        { ...template, id: 'official' },
        { ...template, id: 'ranked', featuredRank: 2 },
        { ...template, id: 'first', featuredRank: 1 },
      ],
      systemCatalog: [systemEntry],
    });
    expect(items.map((item) => item.id)).toEqual([
      'template-first',
      'template-ranked',
      'template-starter',
      'template-second',
      'system-official',
    ]);
    expect(items.filter((item) => item.systemEntry)).toHaveLength(1);
    expect(items[2].href).toContain('template=starter');
  });

  it('only links installed official workflows with an installed id', () => {
    const items = buildCatalogItems({
      href,
      templates: [],
      systemCatalog: [
        systemEntry,
        {
          ...systemEntry,
          canonicalId: 'installed',
          installed: true,
          installedWorkflowId: 'workflow-copy',
        },
        { ...systemEntry, canonicalId: 'missing-id', installed: true },
      ],
    });
    expect(items[0]).toMatchObject({ source: 'available', href: undefined });
    expect(items[1]).toMatchObject({
      source: 'installed',
      href: '/fixture/automation/workflows/workflow-copy',
    });
    expect(items[2]).toMatchObject({ source: 'installed', href: undefined });
  });

  it('only showcases positive integer ranks and sorts them without mutating templates', () => {
    const templates = [
      template,
      ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 3, 1].map(
        (featuredRank, index) => ({
          ...template,
          id: String(index),
          featuredRank,
        }),
      ),
    ];
    const order = templates.map((item) => item.id);
    expect(
      buildShowcaseFeaturedItems(templates, href).map(
        (item) => item.featuredRank,
      ),
    ).toEqual([1, 3]);
    expect(templates.map((item) => item.id)).toEqual(order);
  });

  it('preserves pin order, fallback names and thumbnail validation', () => {
    const pinned: FeaturedWorkflow = {
      id: 'pin',
      label: null,
      description: null,
      featuredRank: 2,
      nodes: [],
      edges: [],
      inputVariables: [],
      thumbnail: 'https://example.com/preview.png',
    };
    const items = buildFeaturedItems(
      [
        pinned,
        {
          ...pinned,
          id: 'other',
          label: 'Other',
          thumbnail: 'javascript:alert(1)',
        },
      ],
      'Untitled',
    );
    expect(items.map((item) => item.id)).toEqual([
      'featured-pin',
      'featured-other',
    ]);
    expect(items[0]).toMatchObject({
      title: 'Untitled',
      description: '',
      featuredWorkflowId: 'pin',
      exampleOutput: { url: 'https://example.com/preview.png' },
    });
    expect(items[1].exampleOutput).toBeUndefined();
  });

  it('combines category, source and case-insensitive trimmed text filters', () => {
    const items = catalog();
    expect(
      filterCatalogItems(items, {
        category: 'social',
        source: 'available',
        searchQuery: '  CHANNEL  ',
      }).map((item) => item.id),
    ).toEqual(['template-starter']);
    expect(
      filterCatalogItems(items, {
        category: 'all',
        source: 'installed',
        searchQuery: '',
      }),
    ).toEqual([]);
    expect(
      filterCatalogItems(items, {
        category: 'content',
        source: 'all',
        searchQuery: 'social',
      }),
    ).toEqual([]);
    expect(
      filterCatalogItems(items, {
        category: 'all',
        source: 'all',
        searchQuery: '  ',
      }),
    ).toEqual(items);
  });

  it('counts categorized catalog items and sorts by translated labels', () => {
    const translate = (key: string) =>
      key === 'categories.social' ? 'Alpha' : 'Zulu';
    const uncategorized = {
      id: 'pin',
      title: 'Pin',
      description: '',
      source: 'available' as const,
    };
    expect(
      buildTypeTiles([...catalog(), catalog()[0], uncategorized], translate),
    ).toEqual([
      { id: 'social', label: 'Alpha', count: 2 },
      { id: 'content', label: 'Zulu', count: 1 },
    ]);
  });

  it('accepts only the three supported catalog sources', () => {
    expect(['all', 'installed', 'available'].every(isCatalogSource)).toBe(true);
    expect(isCatalogSource('unexpected')).toBe(false);
  });
});
