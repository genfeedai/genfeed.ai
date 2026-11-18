import type {
  AgentPageControlChangeStep,
  AgentToolResult,
} from '@genfeedai/contracts/interfaces';

const MAX_PAGE_CHANGE_STEPS = 10;
const MAX_PAGE_CHANGE_SUMMARY_LENGTH = 200;
const MAX_PAGE_CHANGE_LABEL_LENGTH = 120;
const MAX_PAGE_CHANGE_VALUE_LENGTH = 500;

/** The steps of a `propose_page_changes` call, or the reason they are unusable. */
function readPageControlChangeSteps(
  value: unknown,
): AgentPageControlChangeStep[] | string {
  if (!Array.isArray(value) || value.length === 0) {
    return 'propose_page_changes requires at least one change.';
  }
  if (value.length > MAX_PAGE_CHANGE_STEPS) {
    return `propose_page_changes takes at most ${MAX_PAGE_CHANGE_STEPS} changes at a time.`;
  }

  const steps: AgentPageControlChangeStep[] = [];
  for (const entry of value) {
    const change = (entry ?? {}) as Record<string, unknown>;
    const label = typeof change.label === 'string' ? change.label.trim() : '';
    const rawValue =
      typeof change.value === 'string' ? change.value.trim() : '';
    if (
      !label ||
      label.length > MAX_PAGE_CHANGE_LABEL_LENGTH ||
      rawValue.length > MAX_PAGE_CHANGE_VALUE_LENGTH
    ) {
      return 'Every change needs the control name from the list and a value.';
    }
    if (change.action === 'setChecked') {
      const normalized = rawValue.toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        return `"${label}" is a switch or checkbox: its value must be "true" or "false".`;
      }
      steps.push({
        action: 'setChecked',
        label,
        value: normalized === 'true',
      });
    } else if (change.action === 'setValue') {
      steps.push({ action: 'setValue', label, value: rawValue });
    } else {
      return `"${label}" needs an action of setChecked or setValue.`;
    }
  }
  return steps;
}

/**
 * Shows the person the changes to page controls the agent wants. Nothing is
 * changed here: the page applies each step, through the control's own change
 * callback, only after the person approves the card.
 */
export function proposePageChanges(
  params: Record<string, unknown>,
): AgentToolResult {
  const steps = readPageControlChangeSteps(params.changes);
  if (typeof steps === 'string') {
    return { creditsUsed: 0, error: steps, success: false };
  }

  const summary =
    typeof params.summary === 'string' ? params.summary.trim() : '';
  const description = summary.slice(0, MAX_PAGE_CHANGE_SUMMARY_LENGTH);

  return {
    creditsUsed: 0,
    data: { stepCount: steps.length },
    nextActions: [
      {
        ...(description ? { description } : {}),
        id: `page-control-change-${steps.map((step) => step.label).join('-')}-${Date.now()}`,
        steps,
        title: `Change ${steps.length === 1 ? 'a setting' : `${steps.length} settings`} on this page`,
        type: 'page_control_change_card',
      },
    ],
    success: true,
  };
}
