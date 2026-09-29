import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import WorkflowToolbar from '@ui/workflow-builder/WorkflowToolbar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowToolbar', () => {
  const defaultProps = {
    isDirty: false,
    isReadOnly: false,
    isSaving: false,
    onHistory: vi.fn(),
    onRun: vi.fn(),
    onSave: vi.fn(),
    onSchedule: vi.fn(),
    onValidate: vi.fn(),
    workflowId: 'workflow-1',
    workflowLabel: 'My Workflow',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should disable save button when saving', () => {
    const { container } = render(
      <WorkflowToolbar {...defaultProps} isDirty={true} isSaving={true} />,
    );
    // When isSaving is true, the Button component hides the "Save" label and shows a spinner.
    // Find the button that contains the spinner (genfeed-loader-root class).
    const spinner = container.querySelector('.genfeed-loader-root');
    expect(spinner).toBeInTheDocument();
    const saveButton = spinner?.closest('button');
    expect(saveButton).toBeDisabled();
  });

  it('should hide edit buttons when isReadOnly is true', () => {
    render(<WorkflowToolbar {...defaultProps} isReadOnly={true} />);
    expect(screen.queryByText('Validate')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('History')).not.toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('should show loading spinner when saving', () => {
    const { container } = render(
      <WorkflowToolbar {...defaultProps} isDirty={true} isSaving={true} />,
    );
    // When isSaving is true, a Spinner with genfeed-loader-root class is rendered
    expect(container.querySelector('.genfeed-loader-root')).toBeInTheDocument();
  });
});
