/**
 * A control on the page the viewer is on, as its page reports it. Names and
 * values come from the page and from what people typed there, so they are
 * data for the model and never instructions.
 */
export interface AgentPageControl {
  /** Actions the page offers on this control, such as `setChecked`. */
  actions: string[];
  /** The control's state the agent may read, such as `{ checked: true }`. */
  state: Record<string, boolean | number | string>;
  /** Accessible name; controls without one are not reported. */
  label: string;
  /** Kind of control, such as `switch` or `select`. */
  kind: string;
  /** Stable while the control is on the page. */
  ref: string;
  /** A sentence marking a control that always waits for a person. */
  confirm?: string;
  isDisabled?: boolean;
}

/** Most controls one request carries; the page keeps the first of the rest out. */
export const AGENT_PAGE_CONTROLS_MAX = 60;
