import {
  executeSilentWithActionState,
  executeWithActionState,
  executeWithLoading,
  withServiceOperation,
  withSilentOperation,
} from '@hooks/utils/service-operation/service-operation.util';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Define mocks inline in factory to avoid hoisting issues
// Create stable mock instances inside factory
vi.mock('@services/core/notifications.service', () => {
  const mockInstance = {
    error: vi.fn(),
    success: vi.fn(),
  };
  return {
    NotificationsService: {
      getInstance: () => mockInstance,
    },
  };
});

vi.mock('@services/core/logger.service', () => {
  return {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { logger as mockLogger } from '@services/core/logger.service';
// Import mocked modules to get references for assertions
import { NotificationsService } from '@services/core/notifications.service';

const mockNotifications = NotificationsService.getInstance();

describe('service-operation utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('withServiceOperation handles success flow', async () => {
    const operation = vi.fn().mockResolvedValue('result');
    const onSuccess = vi.fn();

    const result = await withServiceOperation({
      errorMessage: 'Failure',
      onSuccess,
      operation,
      successMessage: 'Success',
      url: 'POST /ingredients',
    });

    expect(operation).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('POST /ingredients success');
    expect(mockNotifications.success).toHaveBeenCalledWith('Success');
    expect(onSuccess).toHaveBeenCalledWith('result');
    expect(result).toBe('result');
  });

  it('withServiceOperation handles error flow without rethrow', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await withServiceOperation({
      errorMessage: 'Delete failed',
      operation,
      successMessage: 'Deleted',
      url: 'DELETE /ingredients/1',
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'DELETE /ingredients/1 failed',
      expect.any(Error),
    );
    expect(mockNotifications.error).toHaveBeenCalledWith('Delete failed');
    expect(result).toBeUndefined();
  });

  it('withServiceOperation rethrows when configured', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      withServiceOperation({
        errorMessage: 'Update failed',
        operation,
        rethrow: true,
        successMessage: 'Updated',
        url: 'PATCH /ingredients/1',
      }),
    ).rejects.toThrow('boom');
  });

  it('withSilentOperation logs success without success notification', async () => {
    const operation = vi.fn().mockResolvedValue('result');
    const onSuccess = vi.fn();

    const result = await withSilentOperation({
      errorMessage: 'Failure',
      onSuccess,
      operation,
      url: 'POST /background-task',
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'POST /background-task success',
    );
    expect(mockNotifications.success).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('result');
    expect(result).toBe('result');
  });

  it('executeWithLoading toggles loading state', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const setLoading = vi.fn();

    const result = await executeWithLoading({
      errorMessage: 'Failed',
      operation,
      setLoading,
      successMessage: 'Done',
      url: 'POST /items',
    });

    expect(setLoading).toHaveBeenCalledTimes(2);
    expect(setLoading.mock.calls[0][0]).toBe(true);
    expect(setLoading.mock.calls[1][0]).toBe(false);
    expect(result).toBe('ok');
  });

  it('executeWithActionState toggles the specified key', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const setActionStates = vi.fn() as unknown as React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >;

    await executeWithActionState({
      errorMessage: 'Delete failed',
      operation,
      setActionStates,
      stateKey: 'isDeleting',
      successMessage: 'Deleted',
      url: 'DELETE /items/1',
    });

    const startUpdater = setActionStates.mock.calls[0][0] as (
      state: Record<string, boolean>,
    ) => Record<string, boolean>;
    const endUpdater = setActionStates.mock.calls[1][0] as (
      state: Record<string, boolean>,
    ) => Record<string, boolean>;

    expect(startUpdater({ isDeleting: false }).isDeleting).toBe(true);
    expect(endUpdater({ isDeleting: true }).isDeleting).toBe(false);
  });

  it('executeSilentWithActionState toggles state without success notification', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const setActionStates = vi.fn() as unknown as React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >;

    const result = await executeSilentWithActionState({
      errorMessage: 'Clone failed',
      operation,
      setActionStates,
      stateKey: 'isCloning',
      url: 'POST /items/clone',
    });

    expect(result).toBe('ok');
    expect(mockNotifications.success).not.toHaveBeenCalled();
    expect(setActionStates).toHaveBeenCalledTimes(2);
  });
});
