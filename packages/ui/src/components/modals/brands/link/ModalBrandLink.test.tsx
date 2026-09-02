import { LinkCategory, ModalEnum } from '@genfeedai/contracts';
import type { ILink } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalBrandLink from '@ui/modals/brands/link/ModalBrandLink';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CrudModalOptions = {
  entity: ILink | null;
  modalId: ModalEnum;
  onConfirm: (isRefreshing?: boolean) => void;
  transformSubmitData?: (formData: Record<string, unknown>) => unknown;
};

const closeModalMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const onSubmitMock = vi.hoisted(() => vi.fn());
const setValueMock = vi.hoisted(() => vi.fn());
const crudModalOptions = vi.hoisted(
  () => ({ current: null }) as { current: CrudModalOptions | null },
);

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: PropsWithChildren<{ title?: string }>) => (
    <div data-testid="modal">
      <span data-testid="modal-title">{title}</span>
      {children}
    </div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', () => ({
  useCrudModal: (options: CrudModalOptions) => {
    crudModalOptions.current = options;

    return {
      closeModal: closeModalMock,
      form: {
        control: {},
        formState: { errors: {}, isValid: true },
        getValues: vi.fn(),
        handleSubmit: vi.fn((fn: (...args: never[]) => unknown) => fn),
        register: vi.fn(),
        reset: vi.fn(),
        setValue: setValueMock,
        watch: vi.fn(() => ''),
      },
      formRef: { current: null },
      // The real hook only exposes `handleDelete` when editing an entity.
      handleDelete: options.entity ? deleteMock : undefined,
      isSubmitting: false,
      onSubmit: onSubmitMock,
    };
  },
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: { name?: string }) => (
    <input data-testid={`input-${props.name ?? 'unknown'}`} />
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
  Button: ({
    label,
    onClick,
    type,
  }: {
    label?: string;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type === 'submit' ? 'submit' : 'button'} onClick={onClick}>
      {label}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@genfeedai/helpers/ui/form-error/form-error.helper', () => ({
  hasFormErrors: () => false,
  parseFormErrors: () => [],
}));

describe('ModalBrandLink', () => {
  const onConfirm = vi.fn();
  const defaultProps = {
    brandId: 'brand-1',
    link: null,
    onConfirm,
  };

  const existingLink = {
    category: LinkCategory.WEBSITE,
    id: 'link-1',
    label: 'Homepage',
    url: 'https://genfeed.ai',
  } as unknown as ILink;

  beforeEach(() => {
    closeModalMock.mockClear();
    deleteMock.mockClear();
    onSubmitMock.mockClear();
    onConfirm.mockClear();
    setValueMock.mockClear();
    crudModalOptions.current = null;
  });

  it('renders brand link form', () => {
    render(<ModalBrandLink {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  // Open: the brand overlay and the Social settings page both mount this modal
  // and drive it through `ModalEnum.BRAND_LINK`. A create pass must not present
  // itself as an edit — no Delete affordance, no `entity`.
  it('opens in create mode when no link is selected', () => {
    render(<ModalBrandLink {...defaultProps} />);

    expect(screen.getByTestId('modal-title')).toHaveTextContent('Add Link');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
    expect(crudModalOptions.current?.entity).toBeNull();
    expect(crudModalOptions.current?.modalId).toBe(ModalEnum.BRAND_LINK);
  });

  it('opens in edit mode when a link is selected', () => {
    render(<ModalBrandLink {...defaultProps} link={existingLink} />);

    expect(screen.getByTestId('modal-title')).toHaveTextContent('Edit Link');
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(crudModalOptions.current?.entity).toBe(existingLink);
  });

  // Save: submitting the form has to reach the CRUD hook, which is what turns
  // it into `LinksService.post` / `.patch`.
  it('routes a submit through the CRUD hook', () => {
    const { container } = render(<ModalBrandLink {...defaultProps} />);

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmitMock).toHaveBeenCalledTimes(1);
  });

  // `model Link` has no `organizationId`; `brandId` is the only tenancy
  // boundary, so a create must always carry the brand.
  it('injects the brand id into create payloads', () => {
    render(<ModalBrandLink {...defaultProps} />);

    expect(
      crudModalOptions.current?.transformSubmitData?.({
        brandId: '',
        category: LinkCategory.WEBSITE,
        label: 'Homepage',
        url: 'https://genfeed.ai',
      }),
    ).toEqual({
      brandId: 'brand-1',
      category: LinkCategory.WEBSITE,
      label: 'Homepage',
      url: 'https://genfeed.ai',
    });
  });

  // Cancel: closes the modal without reporting success, so the caller never
  // refetches on a discarded edit.
  it('closes without confirming when cancelled', () => {
    render(<ModalBrandLink {...defaultProps} link={existingLink} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(closeModalMock).toHaveBeenCalledTimes(1);
    expect(closeModalMock).toHaveBeenCalledWith();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('deletes through the CRUD hook when editing', () => {
    render(<ModalBrandLink {...defaultProps} link={existingLink} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
