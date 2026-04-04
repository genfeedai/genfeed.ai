import StudioSelectionActionsBar from '@pages/studio/selection/StudioSelectionActionsBar';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('StudioSelectionActionsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <StudioSelectionActionsBar
        selectedCount={0}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display selected count', () => {
    render(
      <StudioSelectionActionsBar
        selectedCount={3}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it('should show action buttons', () => {
    render(
      <StudioSelectionActionsBar
        selectedCount={3}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});
