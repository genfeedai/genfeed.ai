import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowRunPanel } from './WorkflowRunPanel';

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    label,
    type,
  }: {
    children?: ReactNode;
    label?: ReactNode;
    type?: 'button' | 'submit' | 'reset';
  }) => <button type={type ?? 'button'}>{children ?? label}</button>,
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    id,
    isChecked,
    label,
    onChange,
  }: {
    id?: string;
    isChecked?: boolean;
    label?: ReactNode;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  }) => {
    const checkbox = (
      <input checked={isChecked} id={id} type="checkbox" onChange={onChange} />
    );

    return label ? (
      <label>
        {checkbox}
        {label}
      </label>
    ) : (
      checkbox
    );
  },
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('WorkflowRunPanel', () => {
  it('associates one visible label with a boolean input and submits its value', async () => {
    const onRun = vi.fn();

    render(
      <WorkflowRunPanel
        inputVariables={[
          {
            key: 'includeWatermark',
            label: 'Include watermark',
            type: 'boolean',
          },
        ]}
        isRunning={false}
        onClose={vi.fn()}
        onRun={onRun}
      />,
    );

    const checkbox = screen.getByRole('checkbox', {
      name: 'Include watermark',
    });
    expect(checkbox).toHaveAttribute('id', 'workflow-run-includeWatermark');
    expect(screen.getAllByText('Include watermark')).toHaveLength(1);

    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(onRun).toHaveBeenCalledWith(
        { includeWatermark: true },
        { saveDefaults: false },
      ),
    );
  });
});
