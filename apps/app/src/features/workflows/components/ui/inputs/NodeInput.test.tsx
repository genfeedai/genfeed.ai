import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NodeInput, NodeSelect, NodeTextarea } from './NodeInput';

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    className,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-classname={className} {...props} />
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    className,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea data-classname={className} {...props} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    disabled,
    onOpenChange,
    onValueChange,
    value,
    defaultValue,
  }: {
    children?: ReactNode;
    defaultValue?: string;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div
      data-default-value={defaultValue}
      data-disabled={String(Boolean(disabled))}
      data-testid="select"
      data-value={value}
    >
      <button type="button" onClick={() => onValueChange?.('selected-value')}>
        change select
      </button>
      <button type="button" onClick={() => onOpenChange?.(false)}>
        close select
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectGroup: ({ children }: { children?: ReactNode }) => (
    <div data-testid="select-group">{children}</div>
  ),
  SelectItem: ({
    children,
    disabled,
    value,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    value: string;
  }) => (
    <div data-disabled={String(Boolean(disabled))} data-value={value}>
      {children}
    </div>
  ),
  SelectLabel: ({ children }: { children?: ReactNode }) => (
    <div data-testid="select-label">{children}</div>
  ),
  SelectTrigger: ({
    children,
    className,
    id,
  }: {
    children?: ReactNode;
    className?: string;
    id?: string;
  }) => (
    <button data-classname={className} id={id} type="button">
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

describe('workflow node inputs', () => {
  it('renders labeled input and textarea controls with workflow node styling', () => {
    const onInputChange = vi.fn();
    const onTextareaChange = vi.fn();

    render(
      <>
        <NodeInput
          label="Webhook URL"
          className="w-20"
          value="https://example.test/hook"
          onChange={onInputChange}
        />
        <NodeTextarea
          label="Prompt"
          className="min-h-24"
          value="Write a launch caption"
          onChange={onTextareaChange}
        />
      </>,
    );

    const input = screen.getByDisplayValue('https://example.test/hook');
    expect(screen.getByText('Webhook URL')).toBeVisible();
    expect(input).toHaveAttribute(
      'data-classname',
      expect.stringContaining('w-20'),
    );
    fireEvent.change(input, { target: { value: 'https://example.test/next' } });
    expect(onInputChange).toHaveBeenCalledTimes(1);

    const textarea = screen.getByDisplayValue('Write a launch caption');
    expect(screen.getByText('Prompt')).toBeVisible();
    expect(textarea).toHaveAttribute(
      'data-classname',
      expect.stringContaining('min-h-24'),
    );
    fireEvent.change(textarea, { target: { value: 'Write a short caption' } });
    expect(onTextareaChange).toHaveBeenCalledTimes(1);
  });

  it('adapts native select and optgroup children to the shared select primitive', () => {
    const onBlur = vi.fn();
    const onChange = vi.fn();

    render(
      <NodeSelect
        label="Destination"
        id="destination-select"
        value={12}
        disabled
        placeholder="Choose destination"
        onBlur={onBlur}
        onChange={onChange}
      >
        ignored text
        <option value="feed">Feed</option>
        <option disabled value="story">
          Story
        </option>
        <option>Missing value</option>
        <optgroup label="Paid">
          <option value="ad">Ad</option>
          <span>Ignored child</span>
        </optgroup>
      </NodeSelect>,
    );

    expect(screen.getByText('Destination')).toHaveAttribute(
      'for',
      'destination-select',
    );
    expect(screen.getByText('Choose destination')).toBeVisible();
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', '12');
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    expect(screen.getByText('Feed')).toHaveAttribute('data-value', 'feed');
    expect(screen.getByText('Story')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByText('Paid')).toBeVisible();
    expect(screen.getByText('Ad')).toHaveAttribute('data-value', 'ad');

    fireEvent.click(screen.getByText('change select'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: 'selected-value' }),
      }),
    );

    fireEvent.click(screen.getByText('close select'));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('passes default select values when uncontrolled', () => {
    render(
      <NodeSelect defaultValue="draft" placeholder="Status">
        <option value="draft">Draft</option>
      </NodeSelect>,
    );

    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-default-value',
      'draft',
    );
  });
});
