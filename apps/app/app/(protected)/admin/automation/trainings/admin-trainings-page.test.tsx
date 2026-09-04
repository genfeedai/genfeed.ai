// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminTrainingsPage from './admin-trainings-page';

const mocks = vi.hoisted(() => ({
  refreshTrainings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@pages/trainings/list/trainings-list', async () => {
  const { useEffect } = await import('react');

  return {
    default: ({
      onRefreshRegister,
    }: {
      onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
    }) => {
      const refresh = async () => {
        await mocks.refreshTrainings();
      };

      useEffect(() => {
        onRefreshRegister?.(refresh);
        return () => {
          onRefreshRegister?.(null);
        };
      }, [onRefreshRegister, refresh]);

      return <div>Trainings list</div>;
    },
  };
});

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, right }: { children: ReactNode; right: ReactNode }) => (
    <div>
      {right}
      {children}
    </div>
  ),
}));

describe('AdminTrainingsPage', () => {
  it('registers an unstable list refresh callback without a render loop', async () => {
    render(<AdminTrainingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(mocks.refreshTrainings).toHaveBeenCalledTimes(1);
    });
  });
});
