import type { MotionComposerController } from '@/features/motion/hooks/use-motion-composer';

/** A Motion pane that reads and drives the shared compose/revise state. */
export interface MotionControllerProps {
  controller: MotionComposerController;
}

export interface MotionProjectViewProps {
  projectId: string;
}
