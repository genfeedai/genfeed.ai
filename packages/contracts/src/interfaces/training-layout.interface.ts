import type { ReactNode } from 'react';

export interface TrainingLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}
