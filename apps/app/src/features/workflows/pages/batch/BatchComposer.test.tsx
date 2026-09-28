import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchComposer from './BatchComposer';

describe('Batch file picker', () => {
  it('uses container columns while preserving file removal', () => {
    const remove = vi.fn();
    render(
      <BatchComposer
        workflows={[]}
        selectedWorkflowId=""
        onWorkflowChange={vi.fn()}
        files={[
          {
            file: new File(['a'], 'source.jpg', { type: 'image/jpeg' }),
            preview: '/source.jpg',
            ingredientId: 'source',
          },
        ]}
        batchRunState={{ canRun: false, isStarting: false }}
        onRunBatch={vi.fn()}
        getRootProps={() => ({})}
        getInputProps={() => ({})}
        dropzoneState={{ hasPendingUploads: false, isDragActive: false }}
        onClearFiles={vi.fn()}
        onRemoveFile={remove}
      />,
    );
    const picker = screen.getByTestId('batch-file-picker');
    expect(picker).toHaveClass('@container');
    expect(picker.firstElementChild).toHaveClass('@[40rem]:grid-cols-4');
    expect(picker.firstElementChild).not.toHaveClass('sm:grid-cols-4');
    fireEvent.click(within(picker).getByRole('button', { name: 'Remove' }));
    expect(remove).toHaveBeenCalledWith(0);
  });
});
