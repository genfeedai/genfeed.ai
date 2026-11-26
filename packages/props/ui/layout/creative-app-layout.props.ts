import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface CreativeAppWorkspaceProps {
  /** The New pane: the prompt that starts a project. */
  agent: ReactNode;
  agentTitle: string;
  /** The projects list. */
  children: ReactNode;
  outputLabel: string;
}

export interface CreativeAppNewPaneProps {
  /** Replaces the hero while something else needs the pane (a project choice). */
  body?: ReactNode;
  /** Suggested starter cards and notices, under the hero description. */
  children?: ReactNode;
  description?: string;
  /** Wider cap for three-up starter cards. */
  isWide?: boolean;
  /** The prompt bar, pinned below the hero. */
  promptBar: ReactNode;
  testId?: string;
  /** The hero title. Leave out when `body` brings its own hero. */
  title?: string;
}

export interface CreativeAppPromptBarProps {
  ariaLabel?: string;
  /** Errors and notices, inside the bar above the editor. */
  banner?: ReactNode;
  beforeBody?: ReactNode;
  /** The editor and the toolbar. */
  children: ReactNode;
  testId?: string;
}

export interface CreativeProjectsEmptyStateProps {
  description?: string;
  icon: IconComponent;
  title: string;
}
