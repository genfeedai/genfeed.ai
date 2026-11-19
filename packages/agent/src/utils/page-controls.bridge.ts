import {
  AGENT_PAGE_CONTROLS_MAX,
  type AgentPageControl,
  type AgentPageControlChangeStep,
} from '@genfeedai/contracts/interfaces';

/** A component the page's bridge reports; only what the agent reads from it. */
export interface PageControlsBridgeComponent {
  actions: string[];
  component: string;
  confirm?: string;
  disabled?: boolean;
  label?: string;
  offPage?: boolean;
  ref: string;
  [state: string]: unknown;
}

export interface PageControlsBridgeStep {
  action: string;
  args?: unknown[];
  ref: string;
}

export interface PageControlsBridgeResult {
  error?: { message: string; step: number };
  ok: boolean;
  steps: { changes?: unknown[]; ref: string; step: number }[];
}

/**
 * The page's control bridge, as the agent uses it. The app owns the bridge
 * (it is built on ui-sdk) and hands it over with `registerPageControlsBridge`,
 * so this package never depends on the library.
 */
export interface PageControlsBridge {
  act: (input: {
    steps: PageControlsBridgeStep[];
  }) => Promise<PageControlsBridgeResult>;
  snapshot: () => PageControlsBridgeComponent[];
}

/** The actions a change card can run on a control. */
const PROPOSABLE_ACTIONS: readonly AgentPageControlChangeStep['action'][] = [
  'setChecked',
  'setValue',
];
/** The state each action changes; a switch's form value, `on`, is not its state. */
const STATE_KEY_BY_ACTION: Record<
  AgentPageControlChangeStep['action'],
  'checked' | 'value'
> = { setChecked: 'checked', setValue: 'value' };

const CONTROL_SAVE_TIMEOUT_MS = 15_000;
const CONTROL_SAVE_POLL_MS = 50;

let registeredBridge: PageControlsBridge | null = null;

/** Hands over the page's bridge; pass null to remove it. */
export function registerPageControlsBridge(
  bridge: PageControlsBridge | null,
): void {
  registeredBridge = bridge;
}

function isPrimitiveState(value: unknown): value is boolean | number | string {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  );
}

function isProposableAction(
  action: string,
): action is AgentPageControlChangeStep['action'] {
  return PROPOSABLE_ACTIONS.some((proposable) => proposable === action);
}

function readProposableActions(component: PageControlsBridgeComponent) {
  return component.actions.filter(isProposableAction);
}

/**
 * The controls on the page the agent can propose changes to, for the chat
 * request. Empty when the page has no bridge or no such control.
 */
export function readPageControls(): AgentPageControl[] | undefined {
  if (!registeredBridge) {
    return undefined;
  }

  const controls: AgentPageControl[] = [];
  for (const component of registeredBridge.snapshot()) {
    const label = component.label?.trim();
    const actions = readProposableActions(component);
    if (!label || component.offPage || actions.length === 0) {
      continue;
    }
    const state: AgentPageControl['state'] = {};
    for (const action of actions) {
      const key = STATE_KEY_BY_ACTION[action];
      const value = component[key];
      if (isPrimitiveState(value)) {
        state[key] = value;
      }
    }
    controls.push({
      actions,
      ...(component.confirm ? { confirm: component.confirm } : {}),
      kind: component.component,
      label,
      ref: component.ref,
      state,
    });
    if (controls.length === AGENT_PAGE_CONTROLS_MAX) {
      break;
    }
  }
  return controls.length > 0 ? controls : undefined;
}

export type PageControlRefusalReason =
  | 'ambiguous'
  | 'failed'
  | 'missing'
  | 'needs-person'
  | 'no-bridge'
  | 'unavailable';

/** What it takes to put one applied change back as it was. */
export interface PageControlRevert {
  action: AgentPageControlChangeStep['action'];
  /** The value the control held right after the change. */
  applied: boolean | number | string;
  /** The value the control held before it. */
  previous: boolean | number | string;
  ref: string;
}

export type PageControlChangeOutcome =
  | {
      /** Absent when the control's earlier value is not one that can be set again. */
      revert?: PageControlRevert;
      status: 'applied';
    }
  | { status: 'unchanged' }
  | {
      /** The page's own words: a `data-agent-confirm` sentence or an error. */
      detail?: string;
      reason: PageControlRefusalReason;
      status: 'refused';
    };

function findControlByLabel(
  bridge: PageControlsBridge,
  label: string,
):
  | { component: PageControlsBridgeComponent }
  | { reason: 'ambiguous' | 'missing' } {
  const wanted = label.trim().toLowerCase();
  const matches = bridge
    .snapshot()
    .filter(
      (component) =>
        !component.offPage && component.label?.trim().toLowerCase() === wanted,
    );
  if (matches.length === 0) {
    return { reason: 'missing' };
  }
  if (matches.length > 1) {
    return { reason: 'ambiguous' };
  }
  return { component: matches[0] };
}

async function readSettledControl(bridge: PageControlsBridge, ref: string) {
  const deadline = Date.now() + CONTROL_SAVE_TIMEOUT_MS;
  // Controlled switches can stay disabled while the page saves their value.
  do {
    await new Promise((resolve) => setTimeout(resolve, CONTROL_SAVE_POLL_MS));
    const current = bridge.snapshot().find((control) => control.ref === ref);
    if (!current?.disabled || current.offPage) {
      return current;
    }
  } while (Date.now() < deadline);
}

async function applyStep(
  bridge: PageControlsBridge,
  step: AgentPageControlChangeStep,
): Promise<PageControlChangeOutcome> {
  const found = findControlByLabel(bridge, step.label);
  if ('reason' in found) {
    return { reason: found.reason, status: 'refused' };
  }
  const { component } = found;
  if (component.confirm) {
    return {
      detail: component.confirm,
      reason: 'needs-person',
      status: 'refused',
    };
  }
  if (!component.actions.includes(step.action)) {
    return { reason: 'unavailable', status: 'refused' };
  }

  const stateKey = STATE_KEY_BY_ACTION[step.action];
  const previous = component[stateKey];
  if (previous === step.value) {
    return { status: 'unchanged' };
  }
  const result = await bridge.act({
    steps: [{ action: step.action, args: [step.value], ref: component.ref }],
  });
  if (!result.ok) {
    return {
      detail: result.error?.message,
      reason: 'failed',
      status: 'refused',
    };
  }
  const current = await readSettledControl(bridge, component.ref);
  if (!current || current.offPage) {
    return { reason: 'failed', status: 'refused' };
  }
  const applied = current[stateKey];
  if (applied === previous) {
    return step.action === 'setChecked'
      ? { reason: 'failed', status: 'refused' }
      : { status: 'unchanged' };
  }
  return {
    ...(isPrimitiveState(previous) && isPrimitiveState(applied)
      ? {
          revert: {
            action: step.action,
            applied,
            previous,
            ref: component.ref,
          },
        }
      : {}),
    status: 'applied',
  };
}

/**
 * Runs the approved steps through the page's controls, one at a time, so one
 * refusal does not hide the others. Each step reports whether the page took
 * the change, already had that value, or refused it.
 */
export async function applyPageControlChanges(
  steps: readonly AgentPageControlChangeStep[],
): Promise<PageControlChangeOutcome[]> {
  const bridge = registeredBridge;
  if (!bridge) {
    return steps.map(() => ({
      reason: 'no-bridge' as const,
      status: 'refused' as const,
    }));
  }
  const outcomes: PageControlChangeOutcome[] = [];
  for (const step of steps) {
    outcomes.push(await applyStep(bridge, step));
  }
  return outcomes;
}

export type PageControlUndoOutcome =
  | { status: 'restored' }
  | {
      /** The page's own words when it refused the change. */
      detail?: string;
      reason: 'changed' | 'failed' | 'missing' | 'no-bridge';
      status: 'kept';
    };

async function revertStep(
  bridge: PageControlsBridge,
  revert: PageControlRevert,
): Promise<PageControlUndoOutcome> {
  const component = bridge
    .snapshot()
    .find((current) => current.ref === revert.ref);
  if (!component || component.offPage) {
    return { reason: 'missing', status: 'kept' };
  }
  // A person changed it after the agent did: their value stands.
  if (component[STATE_KEY_BY_ACTION[revert.action]] !== revert.applied) {
    return { reason: 'changed', status: 'kept' };
  }
  const result = await bridge.act({
    steps: [
      { action: revert.action, args: [revert.previous], ref: revert.ref },
    ],
  });
  if (!result.ok) {
    return { detail: result.error?.message, reason: 'failed', status: 'kept' };
  }
  const restored = await readSettledControl(bridge, revert.ref);
  return restored?.[STATE_KEY_BY_ACTION[revert.action]] === revert.previous &&
    !restored.offPage
    ? { status: 'restored' }
    : { reason: 'failed', status: 'kept' };
}

/**
 * Puts the changes of an approved card back, newest first. A control the
 * person changed since, or that left the page, keeps its value, and the
 * result says so; one such control does not stop the others. The results line
 * up with `reverts`.
 */
export async function undoPageControlChanges(
  reverts: readonly PageControlRevert[],
): Promise<PageControlUndoOutcome[]> {
  const bridge = registeredBridge;
  if (!bridge) {
    return reverts.map(
      (): PageControlUndoOutcome => ({ reason: 'no-bridge', status: 'kept' }),
    );
  }
  const outcomes: PageControlUndoOutcome[] = [];
  for (const revert of [...reverts].reverse()) {
    outcomes.unshift(await revertStep(bridge, revert));
  }
  return outcomes;
}
