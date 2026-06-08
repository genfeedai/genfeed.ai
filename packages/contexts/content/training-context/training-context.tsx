'use client';

import type { ITraining } from '@genfeedai/interfaces';
import type { TrainingContextType } from '@genfeedai/interfaces/training/training-context.interface';
import { createContext, type ReactNode, use, useMemo } from 'react';

const TrainingContext = createContext<TrainingContextType | undefined>(
  undefined,
);

export function TrainingProvider({
  children,
  training,
  refreshTraining,
}: {
  children: ReactNode;
  training: ITraining;
  refreshTraining: () => Promise<void>;
}) {
  const contextValue = useMemo(
    () => ({ refreshTraining, training }),
    [refreshTraining, training],
  );

  return (
    <TrainingContext.Provider value={contextValue}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining() {
  const context = use(TrainingContext);
  if (!context) {
    throw new Error('useTraining must be used within a TrainingProvider');
  }
  return context;
}
