// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectField,
  SelectItem,
} from './select';

vi.mock('@radix-ui/react-select', () => ({
  Content: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Icon: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Item: ({ children, value }: { children?: ReactNode; value: string }) => (
    <span data-testid="select-item" data-value={value}>
      {children}
    </span>
  ),
  ItemIndicator: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ItemText: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Label: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Root: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="select-root" data-value={value}>
      <button
        onClick={() => onValueChange?.('__genfeed_empty_select_item__')}
        type="button"
      >
        Choose empty
      </button>
      {children}
    </div>
  ),
  ScrollDownButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ScrollUpButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Separator: () => null,
  Trigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Value: () => null,
  Viewport: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe('Select empty values', () => {
  it('maps empty root and item values to a Radix-safe sentinel', () => {
    const onValueChange = vi.fn();

    render(
      <Select value="" onValueChange={onValueChange}>
        <SelectItem value="">No selection</SelectItem>
      </Select>,
    );

    expect(screen.getByTestId('select-root')).toHaveAttribute(
      'data-value',
      EMPTY_SELECT_ITEM_VALUE,
    );
    expect(screen.getByTestId('select-item')).toHaveAttribute(
      'data-value',
      EMPTY_SELECT_ITEM_VALUE,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose empty' }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('keeps SelectField empty options selectable without exposing the sentinel', () => {
    const onChange = vi.fn();

    render(
      <SelectField name="brand" onChange={onChange} value="">
        <option value="">No brand</option>
        <option value="brand-1">Brand one</option>
      </SelectField>,
    );

    expect(screen.getAllByTestId('select-item')[0]).toHaveAttribute(
      'data-value',
      EMPTY_SELECT_ITEM_VALUE,
    );
    expect(screen.getByLabelText('brand')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Choose empty' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: '' }),
      }),
    );
  });
});
