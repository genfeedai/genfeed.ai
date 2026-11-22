import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Stateless model checker for concurrent code that talks to shared state.
 *
 * A race is a schedule nobody wrote a test for. The explorer runs the real
 * code once per schedule instead: every call into shared state (a Redis
 * command, a row update) is a `step` that suspends the calling actor, and the
 * explorer decides which suspended actor runs next. It repeats the run until
 * every order of the steps, every crash point and every claim expiry has been
 * tried, and fails with the schedule that broke an invariant.
 *
 * The shared state belongs to the scenario. Its fakes call `sim.step(label)`
 * before they apply an operation, so each operation is atomic, like a Redis
 * command or a single SQL statement.
 */

export type Trace = string[];

export type Violation = {
  message: string;
  trace: Trace;
};

export type ExploreResult = {
  schedules: number;
  violation: Violation | null;
};

export type Scenario = {
  /** Checked after every step; return a message when the state is bad. */
  invariant?: () => string | null;
  /**
   * The shared state, serialised. Two schedules that reach the same snapshot
   * with every actor having seen the same things continue identically, so the
   * explorer follows only the first. Without it every order is tried.
   */
  snapshot?: () => string;
  /** Checked once nothing can run any more; return a message when it is bad. */
  final?: () => string | null;
  /** Starts the actors. Called once per schedule on a fresh simulation. */
  start: (sim: Simulation) => void;
};

type Blocked = {
  actor: string;
  /** What the actor does once scheduled; one entry per outcome it may have. */
  branches: readonly string[];
  label: string;
  resume: (branch: number) => void;
};

type Environment = {
  apply: () => void;
  enabled: () => boolean;
  label: string;
};

type Option =
  | { kind: 'resume'; blocked: Blocked; branch: number }
  | { kind: 'crash'; blocked: Blocked }
  | { kind: 'environment'; environment: Environment };

type Choice = { options: number; taken: number };

const actorOf = new AsyncLocalStorage<string>();

export class Simulation {
  private readonly blocked: Blocked[] = [];
  private readonly environments: Environment[] = [];
  private readonly running = new Set<string>();
  private readonly crashed = new Set<string>();
  private readonly crashable = new Set<string>();
  private readonly choices: Choice[] = [];
  private readonly trace: Trace = [];
  private readonly redeliveries: Array<() => void> = [];

  private readonly histories = new Map<string, string[]>();

  constructor(
    private readonly path: readonly number[],
    private readonly visited: Set<string>,
  ) {}

  /**
   * Records what the calling actor just learned from shared state. An actor's
   * next move depends on it, so states that differ in it are different states.
   */
  observed(value: unknown): void {
    this.remember(actorOf.getStore() ?? 'main', `=${JSON.stringify(value)}`);
  }

  private remember(actor: string, entry: string): void {
    const history = this.histories.get(actor) ?? [];
    history.push(entry);
    this.histories.set(actor, history);
  }

  private stateKey(scenario: Scenario): string | null {
    if (!scenario.snapshot) return null;
    return JSON.stringify([
      scenario.snapshot(),
      [...this.histories.entries()].sort(([a], [b]) => a.localeCompare(b)),
      this.redeliveries.length,
      [...this.running].sort(),
    ]);
  }

  /** Starts an actor. A crashable actor can die at any step it is blocked on. */
  spawn(
    name: string,
    run: () => Promise<unknown>,
    options: { crashable?: boolean } = {},
  ): void {
    this.running.add(name);
    if (options.crashable) this.crashable.add(name);
    actorOf.run(name, () => {
      run()
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(name);
        });
    });
  }

  /** Runs `start` once every earlier actor has ended or died. */
  onQuiescence(start: () => void): void {
    this.redeliveries.push(start);
  }

  /** Suspends the calling actor until the explorer schedules it. */
  async step(label: string): Promise<void> {
    await this.block(label, ['']);
  }

  /** Lets the explorer pick between outcomes, such as a handler's result. */
  async choose<T extends string>(
    label: string,
    outcomes: readonly T[],
  ): Promise<T> {
    const branch = await this.block(label, outcomes);
    return outcomes[branch] as T;
  }

  /** A fact the explorer may change at any time, such as a claim expiring. */
  environment(label: string, enabled: () => boolean, apply: () => void): void {
    this.environments.push({ apply, enabled, label });
  }

  private block(label: string, branches: readonly string[]): Promise<number> {
    const actor = actorOf.getStore() ?? 'main';
    return new Promise<number>((resolve) => {
      this.blocked.push({ actor, branches, label, resume: resolve });
    });
  }

  /** Runs one schedule; returns the choices it made so the caller can backtrack. */
  async run(
    scenario: Scenario,
  ): Promise<{ choices: Choice[]; violation: Violation | null }> {
    scenario.start(this);
    for (;;) {
      await settle();
      const message = scenario.invariant?.() ?? null;
      if (message) return this.finish(message);
      if (this.alreadyExplored(scenario)) return this.finish(null);
      const options = this.options();
      if (options.length === 0) {
        const next = this.redeliveries.shift();
        if (next) {
          this.trace.push('redelivery');
          next();
          continue;
        }
        const stuck = [...this.running];
        if (stuck.length > 0) {
          return this.finish(`deadlock: ${stuck.join(', ')} cannot proceed`);
        }
        return this.finish(scenario.final?.() ?? null);
      }
      const taken = this.path[this.choices.length] ?? 0;
      if (taken >= options.length) {
        throw new Error(
          'The scenario is not deterministic: a replayed schedule offered fewer options.',
        );
      }
      this.choices.push({ options: options.length, taken });
      this.apply(options[taken] as Option);
    }
  }

  /**
   * True when an earlier schedule reached this state and explored everything
   * after it. The replayed prefix of this schedule is that earlier schedule, so
   * only states beyond it count.
   */
  private alreadyExplored(scenario: Scenario): boolean {
    if (this.choices.length < this.path.length) return false;
    const key = this.stateKey(scenario);
    if (key === null) return false;
    if (this.visited.has(key)) return true;
    this.visited.add(key);
    return false;
  }

  private options(): Option[] {
    const out: Option[] = [];
    for (const blocked of this.blocked) {
      blocked.branches.forEach((_, branch) => {
        out.push({ blocked, branch, kind: 'resume' });
      });
    }
    for (const blocked of this.blocked) {
      if (this.crashable.has(blocked.actor)) {
        out.push({ blocked, kind: 'crash' });
      }
    }
    for (const environment of this.environments) {
      if (environment.enabled()) out.push({ environment, kind: 'environment' });
    }
    return out;
  }

  private apply(option: Option): void {
    if (option.kind === 'environment') {
      this.trace.push(`environment: ${option.environment.label}`);
      option.environment.apply();
      return;
    }
    const { actor, branches, label } = option.blocked;
    if (option.kind === 'crash') {
      this.trace.push(`${actor} crashes before ${label}`);
      this.remember(actor, 'crash');
      this.crashed.add(actor);
      this.running.delete(actor);
      for (let index = this.blocked.length - 1; index >= 0; index -= 1) {
        if (this.blocked[index]?.actor === actor) this.blocked.splice(index, 1);
      }
      return;
    }
    this.blocked.splice(this.blocked.indexOf(option.blocked), 1);
    const outcome = branches[option.branch];
    this.trace.push(
      outcome ? `${actor}: ${label} -> ${outcome}` : `${actor}: ${label}`,
    );
    this.remember(actor, `${label}:${option.branch}`);
    option.blocked.resume(option.branch);
  }

  private finish(message: string | null) {
    return {
      choices: this.choices,
      violation: message ? { message, trace: [...this.trace] } : null,
    };
  }
}

function hasSibling(choice: Choice | undefined): boolean {
  return choice !== undefined && choice.taken + 1 < choice.options;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export type ExploreOptions = {
  /** Stops with an error rather than silently checking a part of the space. */
  maxSchedules?: number;
};

/** Tries every schedule of the scenario and returns the first violation. */
export async function explore(
  build: () => Scenario,
  options: ExploreOptions = {},
): Promise<ExploreResult> {
  const maxSchedules = options.maxSchedules ?? 200_000;
  let path: number[] = [];
  let schedules = 0;
  const visited = new Set<string>();
  for (;;) {
    schedules += 1;
    if (schedules > maxSchedules) {
      throw new Error(
        `The model has more than ${maxSchedules} schedules. Narrow the scenario (fewer actors or steps) instead of raising the bound.`,
      );
    }
    const simulation = new Simulation(path, visited);
    const { choices, violation } = await simulation.run(build());
    if (violation) return { schedules, violation };
    let depth = choices.length - 1;
    while (depth >= 0 && !hasSibling(choices[depth])) depth -= 1;
    if (depth < 0) return { schedules, violation: null };
    path = [
      ...choices.slice(0, depth).map((choice) => choice.taken),
      (choices[depth]?.taken ?? 0) + 1,
    ];
  }
}
