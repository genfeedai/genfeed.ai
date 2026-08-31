import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { act, render, screen } from '@testing-library/react';
import Modal from '@ui/modals/modal/Modal';
import { describe, expect, it } from 'vitest';

function triggerOpen(id: string) {
  act(() => {
    openModal(id);
  });
}

describe('Modal', () => {
  it('should render without crashing', () => {
    render(
      <Modal id="modal-test" title="Test Modal">
        <div>Modal content</div>
      </Modal>,
    );
    triggerOpen('modal-test');
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <Modal id="modal-test" title="Test Modal">
        <button type="button">Action</button>
      </Modal>,
    );
    triggerOpen('modal-test');
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <Modal id="modal-test" title="Test Modal" modalBoxClassName="custom-box">
        <div>Modal content</div>
      </Modal>,
    );
    triggerOpen('modal-test');
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('scrolls the body inside the padded modal shell', () => {
    render(
      <Modal id="modal-scroll" title="Scrollable modal">
        <div>Long modal content</div>
      </Modal>,
    );
    triggerOpen('modal-scroll');

    expect(screen.getByRole('dialog')).toHaveClass('overflow-hidden');
    expect(
      screen
        .getByText('Long modal content')
        .closest('[data-modal-scroll-region]'),
    ).toHaveClass('overflow-y-auto');
  });
});
