import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '@ui/modals/compound';
import { describe, expect, it } from 'vitest';

describe('compound Modal scrolling', () => {
  it('keeps the header and footer outside the default body scroll region', () => {
    render(
      <Modal.Root defaultOpen>
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>Long setup</Modal.Title>
            <Modal.Description>Follow these steps.</Modal.Description>
          </Modal.Header>
          <Modal.Body>Setup content</Modal.Body>
          <Modal.Footer>
            <Modal.CloseButton>Finish</Modal.CloseButton>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>,
    );

    const region = screen
      .getByText('Setup content')
      .closest('[data-modal-scroll-region]');
    expect(region).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(screen.getByRole('dialog')).toHaveClass('overflow-hidden');
    expect(region).not.toContainElement(
      screen.getByRole('heading', { name: 'Long setup' }),
    );
    expect(region).not.toContainElement(
      screen.getByRole('button', { name: 'Finish' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows an explicit body scroll opt-out for content that owns its scrolling', () => {
    render(
      <Modal.Root defaultOpen>
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>Custom pane</Modal.Title>
          </Modal.Header>
          <Modal.Body scrollable={false}>Custom scroll pane</Modal.Body>
        </Modal.Content>
      </Modal.Root>,
    );
    expect(
      screen
        .getByText('Custom scroll pane')
        .closest('[data-modal-scroll-region]'),
    ).toBeNull();
  });
});
