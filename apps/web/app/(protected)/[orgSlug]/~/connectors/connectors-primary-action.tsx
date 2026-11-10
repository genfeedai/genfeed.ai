'use client';

import type {
  ConnectorsPrimaryAction,
  ConnectorsPrimaryActionContextValue,
} from '@genfeedai/props/pages/connectors.props';
import { createContext, useContext, useEffect } from 'react';

export const ConnectorsPrimaryActionContext =
  createContext<ConnectorsPrimaryActionContextValue>({
    setPrimaryAction: () => undefined,
  });

/**
 * Puts a section's primary action (Connect account, ...) in the page header's
 * right cluster, last, instead of in the section body. The action is removed
 * when the section unmounts. `onClick` must be stable.
 */
export function useConnectorsPrimaryAction(
  label: string,
  onClick: () => void,
): void {
  const { setPrimaryAction } = useContext(ConnectorsPrimaryActionContext);

  useEffect(() => {
    setPrimaryAction({ label, onClick });
    return () => setPrimaryAction(null);
  }, [label, onClick, setPrimaryAction]);
}
