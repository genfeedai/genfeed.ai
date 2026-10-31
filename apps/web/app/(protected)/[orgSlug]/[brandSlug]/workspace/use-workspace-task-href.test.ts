import type { IBrand } from '@genfeedai/contracts/interfaces';
import { Task } from '@services/management/tasks.service';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanningConversation } from './use-planning-conversation';
import { useWorkspaceTaskHref } from './use-workspace-task-href';

const mocks = vi.hoisted(() => ({
  brands: [
    {
      id: 'owner',
      slug: 'owner-brand',
      organization: { id: 'org-1', slug: 'acme' },
    },
    {
      id: 'foreign',
      slug: 'foreign-brand',
      organization: { id: 'org-2', slug: 'elsewhere' },
    },
  ],
  ensurePlanningThread: vi.fn(),
  pathname: '/acme/current-brand/workspace/tasks',
  push: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: mocks.brands as unknown as IBrand[],
    selectedBrand: { slug: 'stale-brand', organization: { slug: 'acme' } },
  }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: async () => 'token' }),
}));
vi.mock('@services/management/tasks.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@services/management/tasks.service')>();
  return {
    ...actual,
    TasksService: {
      getInstance: () => ({ ensurePlanningThread: mocks.ensurePlanningThread }),
    },
  };
});

const task = (brandId: string | null) =>
  new Task({ id: 'task-1', organizationId: 'org-1', brandId });

describe('task owner navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/acme/current-brand/workspace/tasks';
    mocks.ensurePlanningThread.mockResolvedValue({ threadId: 'plan-1' });
  });

  it.each(['current-brand', '~'])(
    'uses the task owner from a %s list',
    (scope) => {
      mocks.pathname = `/acme/${scope}/workspace/tasks`;
      const { result } = renderHook(() => useWorkspaceTaskHref());
      expect(result.current(task('owner'), '/agent/report-1')).toBe(
        '/acme/owner-brand/agent/report-1',
      );
    },
  );

  it.each([null, 'unavailable', 'foreign'])(
    'keeps %s owners out of the selected brand',
    (brandId) => {
      const { result } = renderHook(() => useWorkspaceTaskHref());
      expect(result.current(task(brandId), '/agent/report-1')).toBe(
        '/acme/~/agent/report-1',
      );
    },
  );

  it.each(['owner', null])(
    'opens the planning conversation for the task owner %s',
    async (brandId) => {
      const onTaskUpdated = vi.fn();
      const onError = vi.fn();
      const setBusyTaskId = vi.fn();
      const { result } = renderHook(() =>
        usePlanningConversation({ onError, onTaskUpdated, setBusyTaskId }),
      );
      await act(async () => {
        await result.current.openPlanningConversation(task(brandId));
      });
      expect(mocks.push).toHaveBeenCalledWith(
        `/acme/${brandId ? 'owner-brand' : '~'}/agent/plan-1`,
      );
      expect(onError).not.toHaveBeenCalled();
      expect(onTaskUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ planningThreadId: 'plan-1' }),
      );
      expect(setBusyTaskId).toHaveBeenLastCalledWith(null);
    },
  );
});
