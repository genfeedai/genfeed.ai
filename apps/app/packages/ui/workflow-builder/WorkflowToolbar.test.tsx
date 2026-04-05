import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('should render without crashing', () => {
    const { container } = render(<WorkflowToolbar {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display workflow label', () => {
    render(<WorkflowToolbar {...defaultProps} />);
    expect(screen.getByText('My Workflow')).toBeInTheDocument();
  });

  it('should show unsaved badge when isDirty is true', () => {
    render(<WorkflowToolbar {...defaultProps} isDirty={true} />);
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('should not show unsaved badge when isDirty is false', () => {
    render(<WorkflowToolbar {...defaultProps} isDirty={false} />);
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument();
  });

  it('should call onSave when save button is clicked', () => {
    const onSave = vi.fn();
    render(
      <WorkflowToolbar {...defaultProps} onSave={onSave} isDirty={true} />,
    );

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('should disable save button when not dirty', () => {
    render(<WorkflowToolbar {...defaultProps} isDirty={false} />);
    const saveButton = screen.getByText('Save');
    expect(saveButton).toBeDisabled();
  });

  it('should disable save button when saving', () => {
    const { container } = render(
      <WorkflowToolbar {...defaultProps} isDirty={true} isSaving={true} />,
    );
    // When isSaving is true, the Button component hides the "Save" label and shows a spinner.
    // Find the button that contains the spinner (animate-spin class).
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    const saveButton = spinner?.closest('button');
    expect(saveButton).toBeDisabled();
  });

  it('should call onValidate when validate button is clicked', () => {
    const onValidate = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onValidate={onValidate} />);

    const validateButton = screen.getByText('Validate');
    fireEvent.click(validateButton);

    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  it('should call onRun when run button is clicked', () => {
    const onRun = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onRun={onRun} />);

    const runButton = screen.getByText('Run');
    fireEvent.click(runButton);

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('should call onSchedule when schedule button is clicked', () => {
    const onSchedule = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onSchedule={onSchedule} />);

    const scheduleButton = screen.getByText('Schedule');
    fireEvent.click(scheduleButton);

    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('should call onHistory when history button is clicked', () => {
    const onHistory = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onHistory={onHistory} />);

    const historyButton = screen.getByText('History');
    fireEvent.click(historyButton);

    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('should hide edit buttons when isReadOnly is true', () => {
    render(<WorkflowToolbar {...defaultProps} isReadOnly={true} />);
    expect(screen.queryByText('Validate')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('History')).not.toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('should always show run button', () => {
    render(<WorkflowToolbar {...defaultProps} isReadOnly={true} />);
    expect(screen.getByText('Run')).toBeInTheDocument();
  });

  it('should show loading spinner when saving', () => {
    const { container } = render(
      <WorkflowToolbar {...defaultProps} isDirty={true} isSaving={true} />,
    );
    // When isSaving is true, a Spinner with animate-spin class is rendered
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
