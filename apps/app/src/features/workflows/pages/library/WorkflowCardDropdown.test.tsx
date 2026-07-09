import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowCardDropdown from './WorkflowCardDropdown';

describe('WorkflowCardDropdown', () => {
  it('keeps duplicate available while hiding delete for canonical system workflows', () => {
    render(
      <WorkflowCardDropdown
        canDelete={false}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Workflow actions' }));

    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
