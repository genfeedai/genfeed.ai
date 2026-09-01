import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { IModel } from '@genfeedai/interfaces';
import ModalModel from '@ui/modals/models/ModalModel';

const imagenModel = {
  id: 'model-1',
  label: 'Imagen 4',
} as IModel;

const closeModal = vi.fn();
const onSubmit = vi.fn();

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: PropsWithChildren<{ title?: string }>) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('./ModalModelFormContent', () => ({
  default: () => <div data-testid="model-form">form</div>,
}));

vi.mock('./ModalModelViewContent', () => ({
  default: () => <div data-testid="model-view">view</div>,
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', () => ({
  useCrudModal: () => ({
    closeModal,
    form: {
      control: undefined,
      formState: { errors: {} },
      handleSubmit: vi.fn((fn) => fn),
      register: vi.fn(),
      reset: vi.fn(),
      setValue: vi.fn(),
      watch: vi.fn(() => ''),
    },
    formRef: { current: null },
    isSubmitting: false,
    onSubmit,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getProviderContracts: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: undefined,
    isError: false,
    isLoading: false,
  }),
}));

describe('ModalModel', () => {
  it('should render without crashing', () => {
    render(<ModalModel onConfirm={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('opens the add-model form and the view-model details', () => {
    const { rerender } = render(<ModalModel onConfirm={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Add Model' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('model-form')).toBeInTheDocument();

    rerender(
      <ModalModel mode="view" onConfirm={vi.fn()} entity={imagenModel} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Imagen 4' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('model-view')).toBeInTheDocument();
    expect(screen.queryByTestId('model-form')).not.toBeInTheDocument();
  });

  it('titles the edit mode from the existing model', () => {
    render(<ModalModel onConfirm={vi.fn()} entity={imagenModel} />);

    expect(
      screen.getByRole('heading', { name: 'Edit Model' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('model-form')).toBeInTheDocument();
  });
});
