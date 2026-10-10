import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import Modal from '@ui/modals/modal/Modal';
import { describe, expect, it } from 'vitest';

function triggerOpen(id: string) {
  act(() => {
    openModal(id);
  });
}

describe('Modal', () => {
  it('returns focus to a programmatic launcher after cancellation', async () => {
    render(
      <>
        <button type="button" onClick={() => openModal('modal-focus-return')}>
          Edit image
        </button>
        <Modal id="modal-focus-return" title="Replace draft">
          <button
            type="button"
            onClick={() => closeModal('modal-focus-return')}
          >
            Cancel
          </button>
        </Modal>
      </>,
    );
    const launcher = screen.getByRole('button', { name: 'Edit image' });
    launcher.focus();
    fireEvent.click(launcher);
    expect(
      screen.getByRole('dialog', { name: 'Replace draft' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it('returns focus after Escape without requiring a Radix trigger', async () => {
    render(
      <>
        <button type="button" onClick={() => openModal('modal-focus-escape')}>
          Open preview
        </button>
        <Modal id="modal-focus-escape" title="Preview">
          <button type="button">Preview action</button>
        </Modal>
      </>,
    );
    const launcher = screen.getByRole('button', { name: 'Open preview' });
    launcher.focus();
    fireEvent.click(launcher);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Preview' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it('names a custom-heading dialog without adding visible header chrome', () => {
    render(
      <Modal id="modal-custom-heading" accessibleTitle="New post">
        <h2>New post</h2>
      </Modal>,
    );
    triggerOpen('modal-custom-heading');

    expect(
      screen.getByRole('dialog', { name: 'New post' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('New post')[0].parentElement).toHaveClass(
      'sr-only',
    );
  });

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
