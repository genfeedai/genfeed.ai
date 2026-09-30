import { PageScope } from '@genfeedai/contracts';
import type { IFolder } from '@genfeedai/contracts/interfaces';
import { render, screen, waitFor } from '@testing-library/react';
import ModalFolder from '@ui/modals/content/folder/ModalFolder';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const setValueMock = vi.hoisted(() => vi.fn());

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', () => ({
  useCrudModal: () => ({
    closeModal: vi.fn(),
    form: {
      control: {},
      formState: { errors: {}, isValid: false },
      getValues: vi.fn(),
      handleSubmit: vi.fn((fn: (...args: never[]) => unknown) => fn),
      register: vi.fn(),
      reset: vi.fn(),
      setValue: setValueMock,
      watch: vi.fn(() => ''),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [],
  }),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    currentApp: 'app',
  },
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: { name?: string }) => (
    <input data-testid={`input-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: { name?: string }) => (
    <textarea data-testid={`textarea-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  SelectField: (props: { name?: string }) => (
    <select data-testid={`select-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label?: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@genfeedai/helpers/ui/form-error/form-error.helper', () => ({
  hasFormErrors: () => false,
  parseFormErrors: () => [],
}));

describe('ModalFolder', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    setValueMock.mockClear();
  });

  it('renders folder form', () => {
    render(<ModalFolder {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders with existing folder', () => {
    const folder = {
      id: 'folder-1',
      label: 'Test Folder',
    };
    render(
      <ModalFolder {...defaultProps} item={folder as unknown as IFolder} />,
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('defaults new brand-scoped folders to the active brand', async () => {
    render(
      <ModalFolder
        {...defaultProps}
        brandId="brand-1"
        scope={PageScope.BRAND}
      />,
    );

    await waitFor(() => {
      expect(setValueMock).toHaveBeenCalledWith('brandId', 'brand-1', {
        shouldValidate: true,
      });
    });
  });

  it('keeps new organization-scoped folders shared', () => {
    render(
      <ModalFolder
        {...defaultProps}
        brandId="brand-1"
        scope={PageScope.ORGANIZATION}
      />,
    );

    expect(setValueMock).not.toHaveBeenCalledWith(
      'brandId',
      expect.anything(),
      expect.anything(),
    );
  });
});
