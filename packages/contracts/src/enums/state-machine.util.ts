import type {
  StateMachine,
  StateMachineDefinition,
} from '../interfaces/utils/state-machine.interface';

/**
 * One shape for every status lifecycle (#9732): a transition table next to
 * the enum, plus `can`, `next`, `isTerminal` and `sourcesOf`. The table is
 * plain data so docs and agent tools can read "what can happen next" without
 * reading service code.
 */
export function defineStateMachine<S extends string>(
  definition: StateMachineDefinition<S>,
): StateMachine<S> {
  const states = Object.keys(definition.transitions) as S[];
  const known = new Set<string>(states);
  for (const [from, targets] of Object.entries(definition.transitions) as [
    S,
    readonly S[],
  ][]) {
    for (const to of targets) {
      if (!known.has(to)) {
        throw new Error(`State machine edge ${from} → ${to} targets no state`);
      }
    }
  }
  const terminal: ReadonlySet<S> = new Set(definition.terminal);

  return {
    can: (from, to) => definition.transitions[from]?.includes(to) ?? false,
    isTerminal: (state) => terminal.has(state),
    next: (from) => definition.transitions[from] ?? [],
    sourcesOf: (to) =>
      states.filter((from) => definition.transitions[from].includes(to)),
    states,
    terminal,
    transitions: definition.transitions,
  };
}
