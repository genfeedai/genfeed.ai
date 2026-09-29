import { describe, expect, it } from 'vitest';

import { temporalStateEquals } from './equality';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function makeNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    data: { outputImage: null, prompt: '', status: 'idle' },
    height: 100,
    id,
    position: { x: 0, y: 0 },
    type: 'imageGen',
    width: 200,
    ...overrides,
  } as any;
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    source,
    sourceHandle: 'output',
    target,
    targetHandle: 'input',
    ...overrides,
  } as any;
}

function makeGroup(id: string, overrides: Record<string, unknown> = {}) {
  return {
    color: '#ff0000',
    id,
    isLocked: false,
    name: 'Group',
    nodeIds: ['n1'],
    ...overrides,
  } as any;
}

function makeState(nodes: any[] = [], edges: any[] = [], groups: any[] = []) {
  return { edges, groups, nodes };
}

/* -------------------------------------------------------------------------- */
/*  temporalStateEquals                                                       */
/* -------------------------------------------------------------------------- */

describe('temporalStateEquals', () => {
  it('returns true for same reference', () => {
    const state = makeState(
      [makeNode('n1')],
      [makeEdge('e1', 'n1', 'n2')],
      [makeGroup('g1')],
    );
    expect(temporalStateEquals(state, state)).toBe(true);
  });

  it('returns false when node data outputImage differs', () => {
    const a = makeState(
      [makeNode('n1', { data: { outputImage: 'a.jpg' } })],
      [],
      [],
    );
    const b = makeState(
      [makeNode('n1', { data: { outputImage: 'b.jpg' } })],
      [],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when node schemaParams differ (JSON comparison)', () => {
    const a = makeState(
      [makeNode('n1', { data: { schemaParams: { steps: 20 } } })],
      [],
      [],
    );
    const b = makeState(
      [makeNode('n1', { data: { schemaParams: { steps: 30 } } })],
      [],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns true when schemaParams are equal objects (different refs)', () => {
    const a = makeState(
      [makeNode('n1', { data: { schemaParams: { steps: 20 } } })],
      [],
      [],
    );
    const b = makeState(
      [makeNode('n1', { data: { schemaParams: { steps: 20 } } })],
      [],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(true);
  });

  it('returns false when node model differs', () => {
    const a = makeState(
      [makeNode('n1', { data: { model: 'flux-dev' } })],
      [],
      [],
    );
    const b = makeState(
      [makeNode('n1', { data: { model: 'flux-pro' } })],
      [],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when edge source changes', () => {
    const a = makeState([], [makeEdge('e1', 'n1', 'n2')], []);
    const b = makeState([], [makeEdge('e1', 'n3', 'n2')], []);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when group name changes', () => {
    const a = makeState([], [], [makeGroup('g1', { name: 'Alpha' })]);
    const b = makeState([], [], [makeGroup('g1', { name: 'Beta' })]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when group nodeIds change', () => {
    const a = makeState([], [], [makeGroup('g1', { nodeIds: ['n1', 'n2'] })]);
    const b = makeState([], [], [makeGroup('g1', { nodeIds: ['n1', 'n3'] })]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when node dimensions change', () => {
    const a = makeState([makeNode('n1', { height: 100, width: 200 })], [], []);
    const b = makeState([makeNode('n1', { height: 150, width: 300 })], [], []);
    expect(temporalStateEquals(a, b)).toBe(false);
  });
});
