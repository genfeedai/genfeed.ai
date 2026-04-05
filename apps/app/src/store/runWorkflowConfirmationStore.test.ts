import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunWorkflowConfirmationStore } from './runWorkflowConfirmationStore';

describe('useRunWorkflowConfirmationStore', () => {
  beforeEach(() => {
    useRunWorkflowConfirmationStore.getState().reset();
  });

  it('opens confirmation when requested', () => {
    useRunWorkflowConfirmationStore.getState().requestConfirmation(() => {});

    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(true);
    expect(useRunWorkflowConfirmationStore.getState().pendingAction).toBeTypeOf('function');
  });

  it('clears pending state on cancel', () => {
    useRunWorkflowConfirmationStore.getState().requestConfirmation(() => {});

    useRunWorkflowConfirmationStore.getState().cancel();

    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(false);
    expect(useRunWorkflowConfirmationStore.getState().pendingAction).toBeNull();
  });

  it('runs pending action once on confirm', async () => {
    const pendingAction = vi.fn();
    useRunWorkflowConfirmationStore.getState().requestConfirmation(pendingAction);

    await useRunWorkflowConfirmationStore.getState().confirm();

    expect(pendingAction).toHaveBeenCalledTimes(1);
    expect(useRunWorkflowConfirmationStore.getState().isOpen).toBe(false);
    expect(useRunWorkflowConfirmationStore.getState().pendingAction).toBeNull();
  });
});
