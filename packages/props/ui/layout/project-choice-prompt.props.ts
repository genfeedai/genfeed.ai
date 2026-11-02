import type { CreativeAppProjectReference } from '@genfeedai/contracts/interfaces';

export interface ProjectChoicePromptProps {
  /** What the agent asks, e.g. "Which project should I apply this to?". */
  question: string;
  /** The viewer's request that needs a project. */
  request: string;
  projects: readonly CreativeAppProjectReference[];
  /** Label of the escape hatch that starts a new project from the request. */
  newProjectLabel: string;
  isDisabled?: boolean;
  onChoose: (projectId: string) => void;
  onCreateNew: () => void;
}
