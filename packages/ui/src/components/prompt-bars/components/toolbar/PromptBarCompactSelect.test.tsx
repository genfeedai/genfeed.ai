import type { PromptBarCompactSelectProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import { createContext, type ReactNode, useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Radix Select needs pointer APIs jsdom lacks; a context stub keeps the
// spec on this component's own wiring (labels, value, onChange, disabled).
vi.mock('@ui/primitives/select', () => {
  const SelectContext = createContext<{
    onValueChange: (value: string) => void;
    value: string;
  }>({ onValueChange: () => undefined, value: '' });
  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      disabled?: boolean;
      onValueChange: (value: string) => void;
      value: string;
    }) => (
      <SelectContext.Provider value={{ onValueChange, value }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      disabled?: boolean;
      value: string;
    }) => {
      const context = useContext(SelectContext);
      return (
        <div
          onClick={() => context.onValueChange(value)}
          onKeyDown={() => undefined}
          role="option"
          aria-selected={context.value === value}
          tabIndex={-1}
        >
          {children}
        </div>
      );
    },
    SelectTrigger: ({
      'aria-label': ariaLabel,
      children,
    }: {
      'aria-label'?: string;
      children: ReactNode;
    }) => (
      <div
        aria-label={ariaLabel}
        aria-expanded={false}
        role="combobox"
        tabIndex={0}
      >
        {children}
      </div>
    ),
    SelectValue: () => {
      const context = useContext(SelectContext);
      return <span>{context.value}</span>;
    },
  };
});

const OPTIONS: PromptBarCompactSelectProps['options'] = [
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
];

describe('PromptBarCompactSelect', () => {
  it('shows the selected label under its aria-label', () => {
    render(
      <PromptBarCompactSelect
        ariaLabel="Format"
        onChange={vi.fn()}
        options={OPTIONS}
        value="16:9"
      />,
    );

    expect(screen.getByLabelText('Format')).toHaveTextContent('16:9');
  });

  it('calls onChange with the chosen option', () => {
    const onChange = vi.fn();
    render(
      <PromptBarCompactSelect
        ariaLabel="Format"
        onChange={onChange}
        options={OPTIONS}
        value="9:16"
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: '16:9' }));
    expect(onChange).toHaveBeenCalledWith('16:9');
  });
});
