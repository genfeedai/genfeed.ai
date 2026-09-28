import type { IBatchProject } from '@genfeedai/contracts/interfaces';
import { SERVICE_OPERATION_ERROR_NAME } from '@services/core/operation-error';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBatchProject } from './useBatchProject';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  getService: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('./batch-projects-api', () => ({ createBatchProjectsApi: vi.fn() }));
const project = (id: string, name = id) =>
  ({ id, brandId: 'brand-1', name, settings: {} }) as IBatchProject;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('persisted Batch project writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue(mocks);
    mocks.get.mockImplementation(async (id: string) => project(id));
    mocks.update.mockImplementation(
      async (id: string, input: { name: string }) => project(id, input.name),
    );
  });
  it('loads saved state and persists edits immediately', async () => {
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await waitFor(() => expect(result.current.project?.id).toBe('a'));
    await act(async () => {
      expect(await result.current.update({ name: 'Renamed' })).toBe(true);
    });
    expect(mocks.update).toHaveBeenCalledWith('a', { name: 'Renamed' });
    expect(result.current.project?.name).toBe('Renamed');
  });
  it('retains a failed operation and later edits until explicit replay succeeds', async () => {
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await waitFor(() => expect(result.current.project).not.toBeNull());
    mocks.update.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      expect(await result.current.update({ name: 'First' })).toBe(false);
    });
    act(() => {
      void result.current.write(
        (api) => api.update('a', { name: 'Second' }),
        undefined,
        true,
      );
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(result.current.hasUnsavedChanges).toBe(true);
    await act(async () => {
      await result.current.retrySave();
    });
    expect(mocks.update.mock.calls.map((call) => call[1].name)).toEqual([
      'First',
      'First',
      'Second',
    ]);
    expect(result.current.project?.name).toBe('Second');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
  it('does not let old reads or writes overwrite another routed project', async () => {
    const old = deferred<IBatchProject>();
    const { result, rerender } = renderHook(
      ({ id }) => useBatchProject(id, 'brand-1'),
      { initialProps: { id: 'a' } },
    );
    await waitFor(() => expect(result.current.project?.id).toBe('a'));
    mocks.update.mockReturnValueOnce(old.promise);
    act(() => {
      void result.current.update({ name: 'Old' });
      void result.current.update({ name: 'Unsent old edit' });
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.project?.id).toBe('b'));
    await act(async () => old.resolve(project('a', 'Old')));
    expect(result.current.project?.id).toBe('b');
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });
  it('replaces an invalid autosave with the corrected value', async () => {
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await waitFor(() => expect(result.current.project).not.toBeNull());
    mocks.update.mockRejectedValueOnce(new Error('invalid name'));
    await act(async () => {
      await result.current.update({ name: 'Invalid' });
    });
    await act(async () => {
      expect(await result.current.update({ name: 'Corrected' })).toBe(true);
    });
    expect(mocks.update.mock.calls.map((call) => call[1].name)).toEqual([
      'Invalid',
      'Corrected',
    ]);
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
  it('allows a fresh quote after a failed generation action without replaying the invalid action', async () => {
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await waitFor(() => expect(result.current.project).not.toBeNull());
    const invalid = vi.fn().mockRejectedValue(new Error('quote expired'));
    await act(async () => {
      expect(await result.current.write(invalid)).toBe(false);
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
    await act(async () => {
      await result.current.update({ name: 'Still editable' });
    });
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(result.current.project?.name).toBe('Still editable');
  });
  it.each([400, 403, 404, 409, 410, 413, 422])(
    'drops permanent %s writes and continues with the valid queued save',
    async (status) => {
      const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
      await waitFor(() => expect(result.current.project).not.toBeNull());
      const failure = Object.assign(new Error('Upload rejected'), {
        name: SERVICE_OPERATION_ERROR_NAME,
        status,
      });
      const upload = vi.fn().mockRejectedValue(failure);
      await act(async () => {
        const rejected = result.current.write(upload, undefined, true);
        const saved = result.current.update({
          name: 'Valid after rejected upload',
        });
        expect(await rejected).toBe(false);
        expect(await saved).toBe(true);
      });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.project?.name).toBe('Valid after rejected upload');
    },
  );
  it.each([413, 422])(
    'normalizes raw upload API %s errors before deciding whether to retry',
    async (status) => {
      const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
      await waitFor(() => expect(result.current.project).not.toBeNull());
      const upload = vi.fn().mockRejectedValue({
        errors: [
          { status: String(status), detail: 'Upload rejected permanently' },
        ],
      });
      await act(async () => {
        expect(await result.current.write(upload, undefined, true)).toBe(false);
      });
      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.error).toBe('Upload rejected permanently');
      await act(async () => {
        expect(
          await result.current.update({ name: 'Saved after rejected upload' }),
        ).toBe(true);
      });
    },
  );
  it('retains a transient service failure until explicit retry', async () => {
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await waitFor(() => expect(result.current.project).not.toBeNull());
    mocks.update.mockRejectedValueOnce(
      Object.assign(new Error('Temporarily unavailable'), {
        name: SERVICE_OPERATION_ERROR_NAME,
        status: 503,
      }),
    );
    await act(async () => {
      await result.current.update({ name: 'Keep me' });
    });
    expect(result.current.hasUnsavedChanges).toBe(true);
    await act(async () => {
      await result.current.retrySave();
    });
    expect(result.current.project?.name).toBe('Keep me');
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it('keeps optimistic edits when an older poll returns', async () => {
    const delayed = deferred<IBatchProject>();
    mocks.get.mockReturnValueOnce(delayed.promise);
    const { result } = renderHook(() => useBatchProject('a', 'brand-1'));
    await act(async () => {
      await result.current.update({ name: 'Latest' });
    });
    await act(async () => delayed.resolve(project('a', 'Stale')));
    expect(result.current.project?.name).toBe('Latest');
  });
});
