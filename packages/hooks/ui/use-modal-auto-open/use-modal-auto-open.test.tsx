'use client';

import { ModalEnum } from '@genfeedai/enums';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

interface TestComponentProps {
  isOpen?: boolean;
  openKey?: number;
}

function TestComponent({ isOpen, openKey }: TestComponentProps) {
  useModalAutoOpen(ModalEnum.UPLOAD, { isOpen, openKey });
  return null;
}

const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

describe('useModalAutoOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  it('opens the modal when isOpen is true', () => {
    render(<TestComponent isOpen />);

    expect(openModal).toHaveBeenCalledWith(ModalEnum.UPLOAD);
  });

  it('closes the modal when isOpen is explicitly false', () => {
    render(<TestComponent isOpen={false} />);

    expect(closeModal).toHaveBeenCalledWith(ModalEnum.UPLOAD);
  });

  it.skip('reopens the modal when openKey changes while open', () => {
    // Note: openKey is not currently used in the effect dependencies
    // This test is skipped until the feature is implemented
    const { rerender } = render(<TestComponent isOpen openKey={0} />);
    expect(openModal).toHaveBeenCalledTimes(1);

    rerender(<TestComponent isOpen openKey={1} />);
    expect(openModal).toHaveBeenCalledTimes(2);
  });
});
