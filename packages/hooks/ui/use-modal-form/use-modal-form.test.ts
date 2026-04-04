import type { UseModalFormOptions } from '@hooks/ui/use-modal-form/use-modal-form';
import { useModalForm } from '@hooks/ui/use-modal-form/use-modal-form';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

type TestFormValues = { label: string; value: string };

const createMockForm = () => ({
  getValues: vi.fn(() => ({ label: '', value: '' })),
  reset: vi.fn(),
  setValue: vi.fn(),
});

describe('useModalForm', () => {
  const modalId = 'test-modal' as never;
  let mockForm: ReturnType<typeof createMockForm>;

  beforeEach(() => {
    mockForm = createMockForm();
    vi.clearAllMocks();
  });

  const createOptions = (): UseModalFormOptions<unknown, TestFormValues> => ({
    defaultValues: { label: '', value: '' },
    form: mockForm as never,
    modalId,
  });

  it('initializes with null error', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    expect(result.current.error).toBeNull();
  });

  it('setError sets error message', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.setError('Something went wrong');
    });
    expect(result.current.error).toBe('Something went wrong');
  });

  it('clearError clears the error', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.setError('Error');
    });
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('resetForm calls form.reset with default values', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.resetForm();
    });
    expect(mockForm.reset).toHaveBeenCalledWith({ label: '', value: '' });
  });

  it('handleClose calls closeModal', async () => {
    const { closeModal } = await import('@helpers/ui/modal/modal.helper');
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.handleClose();
    });
    expect(closeModal).toHaveBeenCalledWith(modalId);
  });

  it('populateForm calls form.setValue for each field', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.populateForm({ label: 'My Label', value: 'My Value' });
    });
    expect(mockForm.setValue).toHaveBeenCalledWith('label', 'My Label', {
      shouldValidate: true,
    });
    expect(mockForm.setValue).toHaveBeenCalledWith('value', 'My Value', {
      shouldValidate: true,
    });
  });

  it('populateForm skips undefined values', () => {
    const { result } = renderHook(() => useModalForm(createOptions()));
    act(() => {
      result.current.populateForm({ label: undefined, value: 'set' });
    });
    expect(mockForm.setValue).toHaveBeenCalledTimes(1);
    expect(mockForm.setValue).toHaveBeenCalledWith('value', 'set', {
      shouldValidate: true,
    });
  });
});
