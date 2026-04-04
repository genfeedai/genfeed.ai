import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPaletteItem } from '@ui/command-palette/command-palette-item/CommandPaletteItem';
import { describe, expect, it, vi } from 'vitest';

const baseCommand: ICommand = {
  action: vi.fn(),
  category: 'actions',
  id: 'cmd-1',
  label: 'Test Command',
};

describe('CommandPaletteItem', () => {
  it('renders command label and description', () => {
    render(
      <CommandPaletteItem
        command={{ ...baseCommand, description: 'Do something' }}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Test Command')).toBeInTheDocument();
    expect(screen.getByText('Do something')).toBeInTheDocument();
  });

  it('renders a React icon component', () => {
    const Icon = ({ className }: { className?: string }) => (
      <svg data-testid="command-icon" className={className} />
    );

    render(
      <CommandPaletteItem
        command={{ ...baseCommand, icon: Icon }}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('command-icon')).toBeInTheDocument();
  });

  it('renders a string icon gracefully', () => {
    render(
      <CommandPaletteItem
        command={{ ...baseCommand, icon: '🎯' }}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('🎯')).toBeInTheDocument();
  });

  it('shows keyboard shortcut keys', () => {
    render(
      <CommandPaletteItem
        command={{ ...baseCommand, shortcut: ['⌘', 'K'] }}
        isSelected={false}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(
      <CommandPaletteItem
        command={baseCommand}
        isSelected={false}
        onClick={handleClick}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
