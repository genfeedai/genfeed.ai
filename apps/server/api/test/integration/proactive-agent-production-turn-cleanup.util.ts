export type ProductionTurnCleanupStep = () => void | Promise<void>;
export type ProductionTurnCleanupPlan = {
  beforeStop: readonly ProductionTurnCleanupStep[];
  closeHandles: readonly ProductionTurnCleanupStep[];
  disposeOwned: readonly ProductionTurnCleanupStep[];
  restoreGuards: readonly ProductionTurnCleanupStep[];
};
type ProductionTurnCleanupController = {
  beginConstruction(): void;
  registerWriterStop(stop: ProductionTurnCleanupStep): void;
  close(plan: ProductionTurnCleanupPlan): Promise<void>;
};
type WriterState = 'not-started' | 'constructing' | 'owned' | 'stopped';

export function createProductionTurnCleanup(): ProductionTurnCleanupController {
  let state: WriterState = 'not-started';
  let stopWriter: ProductionTurnCleanupStep | undefined;
  let closing: Promise<void> | undefined;
  const execute = async (plan: ProductionTurnCleanupPlan) => {
    const errors: unknown[] = [];
    const attempt = async (steps: readonly ProductionTurnCleanupStep[]) => {
      for (const step of steps) {
        try {
          await step();
        } catch (error) {
          errors.push(error);
        }
      }
    };
    await attempt(plan.beforeStop);
    if (state === 'owned' && stopWriter) {
      try {
        await stopWriter();
        state = 'stopped';
      } catch (error) {
        errors.push(error);
      }
    }
    const stopped = state === 'not-started' || state === 'stopped';
    if (!stopped)
      errors.push(
        Object.assign(new Error('PRODUCTION_TURN_WRITERS_UNPROVEN'), {
          code: 'PRODUCTION_TURN_WRITERS_UNPROVEN',
        }),
      );
    await attempt(plan.closeHandles);
    if (stopped) await attempt(plan.disposeOwned);
    if (stopped && errors.length === 0) await attempt(plan.restoreGuards);
    if (errors.length)
      throw new AggregateError(errors, 'Production-turn owned cleanup failed');
  };
  return {
    beginConstruction() {
      if (state !== 'not-started' || closing)
        throw new Error('Invalid production-turn construction transition');
      state = 'constructing';
    },
    registerWriterStop(stop) {
      if (state !== 'constructing' || closing)
        throw new Error('Invalid production-turn writer ownership transition');
      stopWriter = stop;
      state = 'owned';
    },
    close(plan) {
      closing ??= execute(plan);
      return closing;
    },
  };
}
