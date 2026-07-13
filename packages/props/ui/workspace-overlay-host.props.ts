import type {
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';
import type { RefObject } from 'react';

export interface WorkspaceOverlayHostProps {
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly isOpen: boolean;
  readonly onDismiss: () => void;
  readonly overlay: WorkspaceShellOverlayRequest | null;
  readonly registration: WorkspaceShellOverlayRegistration | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}
