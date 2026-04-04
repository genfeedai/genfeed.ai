'use client';

import type { ITrainingsContextType } from '@genfeedai/interfaces/models/trainings-context.interface';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const TrainingsContext = createContext<ITrainingsContextType>({
  isRefreshing: false,
  refreshTrainings: null,
  setRefreshTrainings: () => {},
});

export function TrainingsProvider({ children }: { children: ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRefreshFn, setHasRefreshFn] = useState(false);
  const rawRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const refreshTrainings = useCallback(() => {
    if (!rawRefreshRef.current) {
      return;
    }
    setIsRefreshing(true);
    rawRefreshRef.current().finally(() => setIsRefreshing(false));
  }, []);

  const setRefreshTrainings = useCallback(
    (fn: (() => Promise<void>) | null) => {
      rawRefreshRef.current = fn;
      setHasRefreshFn(!!fn);
    },
    [],
  );

  const contextValue = useMemo<ITrainingsContextType>(
    () => ({
      isRefreshing,
      refreshTrainings: hasRefreshFn ? refreshTrainings : null,
      setRefreshTrainings,
    }),
    [hasRefreshFn, refreshTrainings, isRefreshing, setRefreshTrainings],
  );

  return (
    <TrainingsContext.Provider value={contextValue}>
      {children}
    </TrainingsContext.Provider>
  );
}

export function useTrainingsContext() {
  return useContext(TrainingsContext);
}
