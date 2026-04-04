/**
 * States for the clip run lifecycle state machine.
 *
 * Flow: idle → generating → merging (optional) → reframing → publishing → done
 * Any state can transition to `failed`.
 * `awaiting_confirmation` is entered when confirmationRequired is true
 * and the machine reaches a checkpoint transition.
 */
export enum ClipRunState {
  Idle = 'idle',
  Generating = 'generating',
  Merging = 'merging',
  Reframing = 'reframing',
  Publishing = 'publishing',
  Done = 'done',
  Failed = 'failed',
  AwaitingConfirmation = 'awaiting_confirmation',
}

/** Ordered pipeline states (excluding terminal/meta states). */
export const PIPELINE_STATES: ClipRunState[] = [
  ClipRunState.Idle,
  ClipRunState.Generating,
  ClipRunState.Merging,
  ClipRunState.Reframing,
  ClipRunState.Publishing,
  ClipRunState.Done,
];

/** States that require user confirmation before proceeding (when flag is on). */
export const CONFIRMATION_CHECKPOINTS: Set<ClipRunState> = new Set([
  ClipRunState.Publishing,
]);

/**
 * Valid transitions map. Each key maps to the set of states it can move to.
 */
export const VALID_TRANSITIONS: Record<ClipRunState, Set<ClipRunState>> = {
  [ClipRunState.Idle]: new Set([ClipRunState.Generating, ClipRunState.Failed]),
  [ClipRunState.Generating]: new Set([
    ClipRunState.Merging,
    ClipRunState.Reframing, // skip merging when not needed
    ClipRunState.Failed,
  ]),
  [ClipRunState.Merging]: new Set([
    ClipRunState.Reframing,
    ClipRunState.Failed,
  ]),
  [ClipRunState.Reframing]: new Set([
    ClipRunState.Publishing,
    ClipRunState.AwaitingConfirmation,
    ClipRunState.Failed,
  ]),
  [ClipRunState.Publishing]: new Set([ClipRunState.Done, ClipRunState.Failed]),
  [ClipRunState.Done]: new Set([]),
  [ClipRunState.Failed]: new Set([
    // retry from any non-terminal state
    ClipRunState.Idle,
    ClipRunState.Generating,
    ClipRunState.Merging,
    ClipRunState.Reframing,
    ClipRunState.Publishing,
  ]),
  [ClipRunState.AwaitingConfirmation]: new Set([
    ClipRunState.Publishing,
    ClipRunState.Failed,
  ]),
};
