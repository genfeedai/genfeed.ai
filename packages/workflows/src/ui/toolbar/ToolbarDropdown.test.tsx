import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaveAsDialog } from './SaveAsDialog';
import { ToolbarDropdown } from './ToolbarDropdown';

describe('ToolbarDropdown', () => {
  function renderDropdown(
    onClick = vi.fn(),
    extra: Partial<{ disabled: boolean }> = {},
  ) {
    render(
      <ToolbarDropdown
        items={[
          {
            icon: <span />,
            id: 'first',
            label: 'First Action',
            onClick,
            ...extra,
          },
          { id: 'sep', separator: true },
          {
            external: true,
            icon: <span />,
            id: 'docs',
            label: 'Docs',
            onClick: vi.fn(),
          },
        ]}
        label="File"
      />,
    );
    return { onClick };
  }

  it('opens on trigger click and lists items', () => {
    renderDropdown();
    expect(screen.queryByText('First Action')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('First Action')).toBeInTheDocument();
    expect(screen.getByText('Docs')).toBeInTheDocument();
    expect(screen.getByText('↗')).toBeInTheDocument();
  });

  it('invokes the item action and closes', () => {
    const { onClick } = renderDropdown();
    fireEvent.click(screen.getByText('File'));
    fireEvent.click(screen.getByText('First Action'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('First Action')).not.toBeInTheDocument();
  });

  it('ignores clicks on disabled items', () => {
    const { onClick } = renderDropdown(vi.fn(), { disabled: true });
    fireEvent.click(screen.getByText('File'));
    fireEvent.click(screen.getByText('First Action'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('File'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('First Action')).not.toBeInTheDocument();
  });

  it('closes on outside mousedown', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('File'));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('First Action')).not.toBeInTheDocument();
  });
});

describe('SaveAsDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <SaveAsDialog
        currentName="Flow"
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prefills the name with a copy suffix', () => {
    render(
      <SaveAsDialog
        currentName="Flow"
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Flow (copy)')).toBeInTheDocument();
  });

  it('saves the trimmed name on submit', () => {
    const onSave = vi.fn();
    render(
      <SaveAsDialog
        currentName="Flow"
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('Workflow Name');
    fireEvent.change(input, { target: { value: '  New Name  ' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('New Name');
  });

  it('disables save for a blank name', () => {
    const onSave = vi.fn();
    render(
      <SaveAsDialog
        currentName="Flow"
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: '   ' },
    });
    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('closes via cancel and Escape', () => {
    const onClose = vi.fn();
    render(
      <SaveAsDialog
        currentName="Flow"
        isOpen={true}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
