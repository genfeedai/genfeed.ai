import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModalExport from '@/components/modals/system/export/ModalExport';

const mocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  format: { value: 'csv' as 'csv' | 'xlsx' },
  setValue: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      ui: {
        exportModal: {
          cancel: 'Cancel',
          clearAll: 'Clear all',
          csvHint: 'Opens anywhere',
          exportAs: 'Export as {format}',
          fieldsCount: 'Fields · {selected} of {total}',
          fieldsLabel: 'Fields to export',
          formatLabel: 'Export format',
          selectAll: 'Select all',
          title: 'Export data',
          xlsxHint: 'Excel workbook',
        },
      },
    }),
  };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children, title }: ModalProps) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  __esModule: true,
  closeModal: mocks.closeModal,
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {} },
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    setValue: mocks.setValue,
    watch: vi.fn(() => mocks.format.value),
  }),
}));

describe('ModalExport', () => {
  const defaultProps = {
    onExport: vi.fn(),
  };

  it('renders export modal', () => {
    render(<ModalExport {...defaultProps} />);
    expect(screen.getByTestId('modal')).toHaveTextContent('Export data');
  });

  it('offers CSV and XLSX as format tiles', () => {
    render(<ModalExport {...defaultProps} />);
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /XLSX/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /XLSX/ }));
    expect(mocks.setValue).toHaveBeenCalledWith('format', 'xlsx', {
      shouldValidate: true,
    });
  });

  it('keeps every export field as a toggle, with the defaults on', () => {
    render(<ModalExport {...defaultProps} />);
    expect(screen.getByText('Fields · 5 of 23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video Label' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Title' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('selects and clears all fields from one button', () => {
    render(<ModalExport {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('Fields · 23 of 23')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('Fields · 0 of 23')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export as CSV' }),
    ).toBeDisabled();
  });

  it('exports the chosen format and fields, then closes', () => {
    const onExport = vi.fn();
    render(<ModalExport onExport={onExport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export as CSV' }));

    expect(onExport).toHaveBeenCalledWith('csv', [
      'videoLabel',
      'views',
      'comments',
      'likes',
      'platform',
      'title',
    ]);
    expect(mocks.closeModal).toHaveBeenCalled();
  });
});
