import { registerPageControlsBridge } from '@genfeedai/agent/utils/page-controls.bridge';
import { createAgent } from '@ui-sdk/react/agent';

/** What a change card may run. Pressing, opening and navigating stay with the person. */
const AGENT_CHANGE_ACTIONS: ReadonlySet<string> = new Set([
  'setChecked',
  'setValue',
]);

/**
 * Lets the in-app agent read the ui-sdk controls on the page and change them
 * once the person approves a change card. Nothing here exposes the controls
 * to a browser agent: the bridge is handed to the agent package only.
 *
 * A step on a control marked `data-agent-confirm` is refused: those wait for
 * the person to make the change themselves.
 */
export function createPageControlsBridge(): ReturnType<typeof createAgent> {
  return createAgent({
    allow: (step) => AGENT_CHANGE_ACTIONS.has(step.action) && !step.confirm,
  });
}

// The bridge hears components as they mount, so it starts with the app. It
// only exists in the browser; the server renders no ui-sdk component state.
if (typeof window !== 'undefined') {
  registerPageControlsBridge(createPageControlsBridge());
}
