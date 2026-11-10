import { describe, expect, it } from 'vitest';
import { defineStateMachine } from './state-machine.util';

type Light = 'green' | 'yellow' | 'red' | 'off';

const light = defineStateMachine<Light>({
  terminal: ['off'],
  transitions: {
    green: ['yellow', 'off'],
    off: [],
    red: ['green', 'off'],
    yellow: ['red', 'off'],
  },
});

describe('defineStateMachine', () => {
  it.each([
    ['green', 'yellow', true],
    ['green', 'red', false],
    ['red', 'green', true],
    ['off', 'green', false],
  ] as const)('%s → %s is legal: %s', (from, to, expected) => {
    expect(light.can(from, to)).toBe(expected);
  });

  it.each([
    ['green', ['yellow', 'off']],
    ['off', []],
  ] as const)('next(%s) is %j', (from, expected) => {
    expect(light.next(from)).toEqual(expected);
  });

  it.each([
    ['off', ['green', 'red', 'yellow']],
    ['green', ['red']],
  ] as const)('sourcesOf(%s) is %j', (to, expected) => {
    expect(light.sourcesOf(to)).toEqual(expected);
  });

  it.each([
    ['off', true],
    ['red', false],
  ] as const)('%s is terminal: %s', (state, expected) => {
    expect(light.isTerminal(state)).toBe(expected);
  });

  it('lists every state once', () => {
    expect(light.states).toEqual(['green', 'off', 'red', 'yellow']);
  });

  it('rejects an edge to an undeclared state', () => {
    expect(() =>
      defineStateMachine<'a' | 'b'>({
        terminal: [],
        transitions: { a: ['c' as 'b'], b: [] },
      }),
    ).toThrow('State machine edge a → c targets no state');
  });
});
