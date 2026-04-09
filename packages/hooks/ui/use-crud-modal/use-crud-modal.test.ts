import { ModalEnum } from '@genfeedai/enums';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockCloseModal = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();
const mockNotificationError = vi.fn();

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: (modalId: string) => mockCloseModal(modalId),
}));

vi.mock('@hookform/resolvers/standard-schema', () => ({
  standardSchemaResolver: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      delete: mockDelete,
      patch: mockPatch,
      post: mockPost,
    }),
  ),
}));

vi.mock('@hooks/ui/use-focus-first-input/use-focus-first-input', () => ({
  useFocusFirstInput: vi.fn(() => ({ current: null })),
}));

vi.mock('@hooks/utils/use-form-submit/use-form-submit', () => ({
  useFormSubmitWithState: vi.fn((handler) => ({
    isSubmitting: false,
    onSubmit: (e: React.FormEvent) => {
      e?.preventDefault?.();
      return handler();
    },
  })),
}));

vi.mock('@genfeedai/services/core/base.service', () => ({
  BaseService: class {},
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mockNotificationError,
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    })),
  },
}));

// Mock react-hook-form
const mockSetValue = vi.fn();
const mockReset = vi.fn();
const mockGetValues = vi.fn();

vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    control: {},
    formState: { errors: {}, isValid: true },
    getValues: mockGetValues,
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: mockReset,
    setValue: mockSetValue,
    watch: vi.fn(),
  })),
}));

const createMockSchema = () => ({
  '~standard': {
    validate: vi.fn().mockReturnValue({ value: {} }),
    vendor: 'valibot',
    version: 1,
  },
});

const createDefaultOptions = () => ({
  defaultValues: { name: '' },
  entity: null as { id: string; name: string } | null,
  modalId: ModalEnum.CREATE_BRAND,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  schema: createMockSchema(),
  serviceFactory: vi.fn(),
});

describe('useCrudModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ id: 'new-123', name: 'New Entity' });
    mockPatch.mockResolvedValue({ id: 'existing-123', name: 'Updated Entity' });
    mockDelete.mockResolvedValue(undefined);
    mockGetValues.mockReturnValue({ name: 'Test Name' });
  });

  describe('Initial State', () => {
    it('returns form instance', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(result.current.form).toBeDefined();
    });

    it('returns formRef for focus management', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(result.current.formRef).toBeDefined();
    });

    it('returns isSubmitting state', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(result.current.isSubmitting).toBe(false);
    });

    it('returns onSubmit handler', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(typeof result.current.onSubmit).toBe('function');
    });

    it('returns closeModal function', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(typeof result.current.closeModal).toBe('function');
    });
  });

  describe('handleDelete', () => {
    it('returns undefined handleDelete when no entity', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(result.current.handleDelete).toBeUndefined();
    });

    it('returns handleDelete function when entity exists', () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      expect(typeof result.current.handleDelete).toBe('function');
    });

    it('calls delete service and closes modal on success', async () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.handleDelete?.();
      });

      expect(mockDelete).toHaveBeenCalledWith('entity-123');
      expect(mockCloseModal).toHaveBeenCalledWith(ModalEnum.CREATE_BRAND);
      expect(options.onConfirm).toHaveBeenCalledWith(true);
    });

    it('shows error notification on delete failure', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.handleDelete?.();
      });

      expect(mockNotificationError).toHaveBeenCalledWith('Failed to delete');
    });
  });

  describe('closeModal', () => {
    it('calls modal helper to close modal', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal();
      });

      expect(mockCloseModal).toHaveBeenCalledWith(ModalEnum.CREATE_BRAND);
    });

    it('resets form to default values', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal();
      });

      expect(mockReset).toHaveBeenCalledWith({ name: '' });
    });

    it('calls onConfirm with true when closed with success', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal(true);
      });

      expect(options.onConfirm).toHaveBeenCalledWith(true);
    });

    it('calls onClose when closed without success', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal(false);
      });

      expect(options.onClose).toHaveBeenCalled();
      expect(options.onConfirm).not.toHaveBeenCalled();
    });

    it('calls onClose when closed with no argument', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal();
      });

      expect(options.onClose).toHaveBeenCalled();
    });
  });

  describe('Create Mode (no entity)', () => {
    it('calls post service on submit', async () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockPost).toHaveBeenCalledWith({ name: 'Test Name' });
    });

    it('closes modal with success after create', async () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockCloseModal).toHaveBeenCalled();
      expect(options.onConfirm).toHaveBeenCalledWith(true);
    });

    it('shows error notification on create failure', async () => {
      mockPost.mockRejectedValue(new Error('Create failed'));

      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockNotificationError).toHaveBeenCalledWith('Failed to create');
    });
  });

  describe('Update Mode (with entity)', () => {
    it('calls patch service on submit', async () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockPatch).toHaveBeenCalledWith('entity-123', {
        name: 'Test Name',
      });
    });

    it('closes modal with success after update', async () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockCloseModal).toHaveBeenCalled();
      expect(options.onConfirm).toHaveBeenCalledWith(true);
    });

    it('shows error notification on update failure', async () => {
      mockPatch.mockRejectedValue(new Error('Update failed'));

      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test Entity' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(mockNotificationError).toHaveBeenCalledWith('Failed to update');
    });
  });

  describe('transformSubmitData', () => {
    it('transforms data before submission', async () => {
      const transformSubmitData = vi.fn((data) => ({
        ...data,
        transformed: true,
      }));

      const options = {
        ...createDefaultOptions(),
        transformSubmitData,
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(transformSubmitData).toHaveBeenCalledWith({ name: 'Test Name' });
      expect(mockPost).toHaveBeenCalledWith({
        name: 'Test Name',
        transformed: true,
      });
    });
  });

  describe('customSubmitHandler', () => {
    it('uses custom handler instead of default service calls', async () => {
      const customSubmitHandler = vi.fn().mockResolvedValue({
        id: 'custom-123',
        name: 'Custom Result',
      });

      const options = {
        ...createDefaultOptions(),
        customSubmitHandler,
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(customSubmitHandler).toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
    });

    it('passes service, entity, and formData to custom handler', async () => {
      const customSubmitHandler = vi.fn().mockResolvedValue({ id: 'result' });
      const entity = { id: 'entity-123', name: 'Test' };

      const options = {
        ...createDefaultOptions(),
        customSubmitHandler,
        entity,
      };
      const { result } = renderHook(() => useCrudModal(options));

      await act(async () => {
        await result.current.onSubmit({
          preventDefault: vi.fn(),
        } as React.FormEvent);
      });

      expect(customSubmitHandler).toHaveBeenCalledWith(
        expect.any(Object),
        entity,
        { name: 'Test Name' },
      );
    });
  });

  describe('Entity Changes', () => {
    it('populates form when entity is provided', () => {
      const entity = { id: 'entity-123', name: 'Existing Name' };
      const options = {
        ...createDefaultOptions(),
        entity,
      };

      renderHook(() => useCrudModal(options));

      expect(mockSetValue).toHaveBeenCalledWith('name', 'Existing Name', {
        shouldValidate: true,
      });
    });

    it('resets form when entity becomes null', () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test' },
      };

      const { rerender } = renderHook(
        ({ entity }) => useCrudModal({ ...options, entity }),
        { initialProps: { entity: options.entity } },
      );

      rerender({ entity: null });

      expect(mockReset).toHaveBeenCalledWith({ name: '' });
    });

    it('does not reset form when entity ID stays the same', () => {
      const options = {
        ...createDefaultOptions(),
        entity: { id: 'entity-123', name: 'Test' },
      };

      const { rerender } = renderHook(
        ({ entity }) => useCrudModal({ ...options, entity }),
        { initialProps: { entity: options.entity } },
      );

      // Clear mocks after initial render
      mockSetValue.mockClear();
      mockReset.mockClear();

      // Rerender with same entity ID but different reference
      rerender({ entity: { id: 'entity-123', name: 'Updated Test' } });

      // Should not have called setValue again since ID is same
      expect(mockSetValue).not.toHaveBeenCalled();
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useCrudModal(options));

      expect(result.current).toHaveProperty('form');
      expect(result.current).toHaveProperty('formRef');
      expect(result.current).toHaveProperty('isSubmitting');
      expect(result.current).toHaveProperty('onSubmit');
      expect(result.current).toHaveProperty('closeModal');
      expect(result.current).toHaveProperty('handleDelete');
    });
  });

  describe('Different Modal Types', () => {
    it('works with CREATE_INGREDIENT modal', async () => {
      const options = {
        ...createDefaultOptions(),
        modalId: ModalEnum.CREATE_INGREDIENT,
      };
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal();
      });

      expect(mockCloseModal).toHaveBeenCalledWith(ModalEnum.CREATE_INGREDIENT);
    });

    it('works with different default values', async () => {
      const options = {
        ...createDefaultOptions(),
        defaultValues: { description: '', isActive: true, name: '' },
      };
      const { result } = renderHook(() => useCrudModal(options));

      act(() => {
        result.current.closeModal();
      });

      expect(mockReset).toHaveBeenCalledWith({
        description: '',
        isActive: true,
        name: '',
      });
    });
  });
});
