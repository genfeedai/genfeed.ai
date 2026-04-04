'use client';

import type { ITraining } from '@cloud/interfaces';
import type { TrainingContextType } from '@cloud/interfaces/training/training-context.interface';
import { createContext, type ReactNode, useContext } from 'react';

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
  return (
    <TrainingContext.Provider value={{ refreshTraining, training }}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining() {
  const context = useContext(TrainingContext);
  if (!context) {
    throw new Error('useTraining must be used within a TrainingProvider');
  }
  return context;
}
