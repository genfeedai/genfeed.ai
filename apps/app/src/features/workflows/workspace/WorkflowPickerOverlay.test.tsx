import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const picker = vi.hoisted(() => ({
  error: null,
  hasNextPage: false,
  isLoading: false,
  page: 1,
  retry: vi.fn(),
  search: '',
  setPage: vi.fn(),
  setSearch: vi.fn(),
  visibleWorkflows: [
    {
      _id: 'workflow-1',
      brandId: 'brand-1',
      createdAt: '2026-07-13T08:00:00.000Z',
      lifecycle: 'published',
      name: 'Launch brief',
      nodeCount: 3,
      updatedAt: '2026-07-13T08:00:00.000Z',
    },
  ],
}));

vi.mock('./useWorkflowPicker', () => ({
  useWorkflowPicker: () => picker,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    disabled,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    onChange,
    value,
    ...props
  }: {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    value: string;
  }) => <input {...props} onChange={onChange} value={value} />,
}));

import { WorkflowPickerOverlay } from './WorkflowPickerOverlay';

describe('WorkflowPickerOverlay', () => {
  it('keeps compact selection separate from editor and request intents', () => {
    const onAttachWorkflow = vi.fn();
    const onOpenLibrary = vi.fn();
    const onOpenWorkflow = vi.fn();

    render(
      <WorkflowPickerOverlay
        activeBrandId="brand-1"
        onAttachWorkflow={onAttachWorkflow}
        onOpenLibrary={onOpenLibrary}
        onOpenWorkflow={onOpenWorkflow}
      />,
    );

    expect(screen.getByText('Launch brief')).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search authorized workflows' }),
      { target: { value: 'launch' } },
    );
    expect(picker.setSearch).toHaveBeenCalledWith('launch');

    fireEvent.click(screen.getByRole('button', { name: 'Use in request' }));
    expect(onAttachWorkflow).toHaveBeenCalledWith(picker.visibleWorkflows[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    expect(onOpenWorkflow).toHaveBeenCalledWith(picker.visibleWorkflows[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Full library' }));
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
  });
});
