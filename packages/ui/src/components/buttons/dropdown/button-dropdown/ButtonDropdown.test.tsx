import { fireEvent, render, screen } from '@testing-library/react';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { describe, expect, it, vi } from 'vitest';

const mockOptions = [
  {
    icon: <span className="size-8" data-testid="option-icon" />,
    label: 'Option A',
    value: 'a',
  },
  { label: 'Option B', value: 'b' },
  { label: 'Option C', value: 'c' },
];

describe('ButtonDropdown', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ButtonDropdown name="test" options={mockOptions} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display placeholder when no value selected', () => {
    render(
      <ButtonDropdown
        name="test"
        options={mockOptions}
        onChange={vi.fn()}
        placeholder="Pick one"
      />,
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('should display selected option label', () => {
    render(
      <ButtonDropdown
        name="test"
        value="b"
        options={mockOptions}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('does not stack the default button border shadow under trigger borders', () => {
    render(
      <ButtonDropdown
        className="border border-border"
        name="test"
        value="b"
        options={mockOptions}
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('border', 'border-border');
    expect(trigger).not.toHaveClass('shadow-border');
  });

  it('renders icon-only trigger without text when enabled', () => {
    render(
      <ButtonDropdown
        name="test"
        value="b"
        options={mockOptions}
        onChange={vi.fn()}
        icon={<span data-testid="trigger-icon">I</span>}
        tooltip="Format"
        triggerDisplay="icon-only"
      />,
    );

    expect(screen.getByTestId('trigger-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Format',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Option B')).not.toBeInTheDocument();
    expect(screen.queryByText('Pick one')).not.toBeInTheDocument();
  });

  it('selects an option from the dropdown menu', async () => {
    const updateButtonDropdown = vi.fn();

    render(
      <ButtonDropdown
        name="test"
        value="a"
        options={mockOptions}
        onChange={updateButtonDropdown}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button'), {
      button: 0,
      ctrlKey: false,
    });
    const option = await screen.findByText('Option C');
    expect(option).toHaveClass(
      'min-h-8',
      'rounded-sm',
      'px-2.5',
      'py-1.5',
      'text-xs',
    );
    fireEvent.click(option);

    expect(updateButtonDropdown).toHaveBeenCalledWith('test', 'c');
  });

  it('normalizes menu icons to the shared 16px menu-item size', async () => {
    render(
      <ButtonDropdown
        name="test"
        value="a"
        options={mockOptions}
        onChange={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button'), {
      button: 0,
      ctrlKey: false,
    });

    const icon = await screen.findByTestId('option-icon');
    expect(icon.parentElement).toHaveClass('[&_svg]:size-4');
  });
});
