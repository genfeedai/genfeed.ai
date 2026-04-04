import type { ModalEnum } from '@genfeedai/enums';

const logError = (message: string, meta?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  console.error(message, meta);
};

const logDebug = (message: string, meta?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  console.debug(message, meta);
};

const modalState = new Map<string, boolean>();
const globalListeners = new Set<() => void>();
const modalListeners = new Map<string, Set<() => void>>();

function normalizeModalId(id: ModalEnum | string): string | null {
  if (!id || typeof id !== 'string') {
    logError('Modal helper: Invalid dialog ID provided', { id });
    return null;
  }

  const normalized = id.trim();
  if (!normalized) {
    logError('Modal helper: Invalid dialog ID provided', { id });
    return null;
  }

  return normalized;
}

function notify(modalId: string): void {
  for (const listener of globalListeners) {
    listener();
  }

  const listeners = modalListeners.get(modalId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

function setOpenState(modalId: string, open: boolean): void {
  const previous = modalState.get(modalId) === true;
  if (previous === open) {
    return;
  }

  modalState.set(modalId, open);
  notify(modalId);
}

export function subscribeModalState(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function subscribeModal(
  id: ModalEnum | string,
  listener: () => void,
): () => void {
  const modalId = normalizeModalId(id);
  if (!modalId) {
    return () => undefined;
  }

  const listeners = modalListeners.get(modalId) ?? new Set<() => void>();
  listeners.add(listener);
  modalListeners.set(modalId, listeners);

  return () => {
    const existing = modalListeners.get(modalId);
    if (!existing) {
      return;
    }

    existing.delete(listener);
    if (existing.size === 0) {
      modalListeners.delete(modalId);
    }
  };
}

export function openModal(id: ModalEnum | string): void {
  const modalId = normalizeModalId(id);
  if (!modalId) {
    return;
  }

  setOpenState(modalId, true);
  logDebug('Modal helper: Modal opened', { id: modalId });
}

export function closeModal(id: ModalEnum | string): boolean {
  const modalId = normalizeModalId(id);
  if (!modalId) {
    return false;
  }

  setOpenState(modalId, false);
  logDebug('Modal helper: Modal closed', { id: modalId });
  return true;
}

export function isModalOpen(id: ModalEnum | string): boolean {
  const modalId = normalizeModalId(id);
  if (!modalId) {
    return false;
  }

  return modalState.get(modalId) === true;
}
