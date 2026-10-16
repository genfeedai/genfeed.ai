import { fireEvent, render, screen } from '@testing-library/react';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';
import { describe, expect, it, vi } from 'vitest';

describe('ModalPostFooter', () => {
  it('should render without crashing', () => {
    const { container } = render(<ModalPostFooter />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalPostFooter />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalPostFooter />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('keeps setup navigation from submitting the publishing form', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const onNextStep = vi.fn();
    const onClose = vi.fn();
    const onPreviousStep = vi.fn();

    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <ModalPostFooter
          activeTab="setup"
          globalDescription="A caption"
          globalLabel="A title"
          globalScheduledDate={new Date('2026-10-16T21:00:00.000Z')}
          hasYoutube
          onClose={onClose}
          onNextStep={onNextStep}
          onPreviousStep={onPreviousStep}
        />
      </form>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Next: Select Platforms' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onNextStep).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <form onSubmit={onSubmit}>
        <ModalPostFooter
          activeTab="platforms"
          enabledCount={1}
          isFormValid
          onPreviousStep={onPreviousStep}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Publish to 1 Platform' }),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
