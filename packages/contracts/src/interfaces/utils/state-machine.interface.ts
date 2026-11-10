/**
 * Input for {@link defineStateMachine}. Every state is a key of
 * `transitions`, so adding a value to the status enum fails to compile until
 * its outgoing edges are written down.
 */
export interface StateMachineDefinition<S extends string> {
  /**
   * Every legal edge, keyed by source state. A self-edge (`RUNNING` →
   * `RUNNING`) is listed only when a writer really re-applies the state.
   */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  /**
   * States that settle the lifecycle for polling, display and orchestration.
   * A terminal state may still have an explicit re-entry edge (a retry).
   */
  readonly terminal: readonly S[];
}

/**
 * A status lifecycle exported as plain data plus the questions callers ask of
 * it. Writers keep their compare-and-set: `sourcesOf(to)` is the allowed
 * prior-status list for an `updateMany` `where`.
 */
export interface StateMachine<S extends string> {
  readonly states: readonly S[];
  readonly terminal: ReadonlySet<S>;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  /** Whether `from` → `to` is a legal edge. */
  can(from: S, to: S): boolean;
  /** Whether `state` settles the lifecycle. */
  isTerminal(state: S): boolean;
  /** Legal next states from `from`. */
  next(from: S): readonly S[];
  /** Every state that may move to `to`, in declaration order. */
  sourcesOf(to: S): S[];
}
