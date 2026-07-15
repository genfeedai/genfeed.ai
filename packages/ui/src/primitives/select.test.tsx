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

vi.mock('@shipshitdev/ui/primitives', () => ({
  Select: ({
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
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => (
    <span data-testid="select-item" data-value={value}>
      {children}
    </span>
  ),
  SelectLabel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectSeparator: () => null,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
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
