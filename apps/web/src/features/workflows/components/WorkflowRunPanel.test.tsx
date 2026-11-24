import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowRunPanel } from './WorkflowRunPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

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

  it('runs only once every required input has a value', async () => {
    const onRun = vi.fn();

    render(
      <WorkflowRunPanel
        inputVariables={[
          {
            key: 'visualAngle',
            label: 'Visual angle',
            required: true,
            type: 'text',
          },
          { key: 'duration', label: 'Duration', type: 'number' },
        ]}
        isRunning={false}
        onClose={vi.fn()}
        onRun={onRun}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText('Visual angle is required')).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: /Visual angle/ }), {
      target: { value: ' low angle ' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration' }), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(onRun).toHaveBeenCalledWith(
        { duration: 8, visualAngle: 'low angle' },
        { saveDefaults: false },
      ),
    );
  });
});
