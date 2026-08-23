import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowCardDropdown from './WorkflowCardDropdown';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      delete: 'Delete',
      disableSchedule: 'Disable schedule',
      duplicate: 'Duplicate',
      menu: 'Workflow actions',
      open: 'Open',
      schedule: 'Schedule',
    };
    return messages[key] ?? key;
  },
}));

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

  it('exposes open, schedule, and disable actions when those handlers are provided', () => {
    const onOpen = vi.fn();
    const onSchedule = vi.fn();
    const onDisableSchedule = vi.fn();

    render(
      <WorkflowCardDropdown
        canDelete={false}
        onDelete={vi.fn()}
        onDisableSchedule={onDisableSchedule}
        onDuplicate={vi.fn()}
        onOpen={onOpen}
        onSchedule={onSchedule}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Workflow actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Workflow actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Workflow actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable schedule' }));
    expect(onDisableSchedule).toHaveBeenCalledTimes(1);
  });
});
