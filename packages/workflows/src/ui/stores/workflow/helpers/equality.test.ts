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

  it('returns true for identical content with different references', () => {
    const a = makeState(
      [makeNode('n1')],
      [makeEdge('e1', 'n1', 'n2')],
      [makeGroup('g1')],
    );
    const b = makeState(
      [makeNode('n1')],
      [makeEdge('e1', 'n1', 'n2')],
      [makeGroup('g1')],
    );
    expect(temporalStateEquals(a, b)).toBe(true);
  });

  it('returns true for empty arrays on all fields', () => {
    const a = makeState([], [], []);
    const b = makeState([], [], []);
    expect(temporalStateEquals(a, b)).toBe(true);
  });

  it('returns false for different node count', () => {
    const a = makeState([makeNode('n1')], [], []);
    const b = makeState([makeNode('n1'), makeNode('n2')], [], []);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when node position differs', () => {
    const a = makeState([makeNode('n1', { position: { x: 0, y: 0 } })], [], []);
    const b = makeState(
      [makeNode('n1', { position: { x: 100, y: 50 } })],
      [],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
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

  it('returns false when edge target changes', () => {
    const a = makeState([], [makeEdge('e1', 'n1', 'n2')], []);
    const b = makeState([], [makeEdge('e1', 'n1', 'n3')], []);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when edge sourceHandle changes', () => {
    const a = makeState(
      [],
      [makeEdge('e1', 'n1', 'n2', { sourceHandle: 'out-a' })],
      [],
    );
    const b = makeState(
      [],
      [makeEdge('e1', 'n1', 'n2', { sourceHandle: 'out-b' })],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when edge targetHandle changes', () => {
    const a = makeState(
      [],
      [makeEdge('e1', 'n1', 'n2', { targetHandle: 'in-a' })],
      [],
    );
    const b = makeState(
      [],
      [makeEdge('e1', 'n1', 'n2', { targetHandle: 'in-b' })],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when group name changes', () => {
    const a = makeState([], [], [makeGroup('g1', { name: 'Alpha' })]);
    const b = makeState([], [], [makeGroup('g1', { name: 'Beta' })]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when group color changes', () => {
    const a = makeState([], [], [makeGroup('g1', { color: '#ff0000' })]);
    const b = makeState([], [], [makeGroup('g1', { color: '#00ff00' })]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when group nodeIds change', () => {
    const a = makeState([], [], [makeGroup('g1', { nodeIds: ['n1', 'n2'] })]);
    const b = makeState([], [], [makeGroup('g1', { nodeIds: ['n1', 'n3'] })]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false for different edge count', () => {
    const a = makeState([], [makeEdge('e1', 'n1', 'n2')], []);
    const b = makeState(
      [],
      [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')],
      [],
    );
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false for different group count', () => {
    const a = makeState([], [], [makeGroup('g1')]);
    const b = makeState([], [], [makeGroup('g1'), makeGroup('g2')]);
    expect(temporalStateEquals(a, b)).toBe(false);
  });

  it('returns false when node dimensions change', () => {
    const a = makeState([makeNode('n1', { height: 100, width: 200 })], [], []);
    const b = makeState([makeNode('n1', { height: 150, width: 300 })], [], []);
    expect(temporalStateEquals(a, b)).toBe(false);
  });
});
