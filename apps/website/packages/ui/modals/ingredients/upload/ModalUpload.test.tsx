import { AssetCategory, IngredientCategory } from '@genfeedai/enums';
import ModalUpload from '@ui/modals/ingredients/upload/ModalUpload';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  default: vi.fn(() =>
    vi.fn(() => ({
      create: vi.fn(),
      upload: vi.fn(),
    })),
  ),
}));

vi.mock('@hooks/ui/use-focus-first-input', () => ({
  default: vi.fn(() => ({ current: null })),
}));

vi.mock('@hooks/utils/use-form-submit', () => ({
  useFormSubmitWithState: vi.fn(() => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  })),
}));

vi.mock('@services/core/socket.service', () => ({
  SocketService: {
    getInstance: vi.fn(() => ({
      emit: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(() => ({
    getInputProps: vi.fn(() => ({ type: 'file' })),
    getRootProps: vi.fn(() => ({ onClick: vi.fn() })),
  })),
}));

describe.skip('ModalUpload', () => {
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with default props', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('should render with custom type for images', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should render with custom type for videos', () => {
    render(<ModalUpload type="video" onConfirm={mockOnConfirm} />);

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should render with custom type for audio', () => {
    render(<ModalUpload type="voice" onConfirm={mockOnConfirm} />);

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should accept logo asset type', () => {
    render(
      <ModalUpload category={AssetCategory.LOGO} onConfirm={mockOnConfirm} />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should accept banner asset type', () => {
    render(
      <ModalUpload category={AssetCategory.BANNER} onConfirm={mockOnConfirm} />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should limit to single file when isMultiple is false', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
        isMultiple={false}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should accept maxFiles prop', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
        maxFiles={10}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should accept width and height props', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
        width={1920}
        height={1080}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should accept parentId and parentModel props', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
        parentId="parent-123"
        parentModel="Project"
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
  });

  it('should show upload button', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    const uploadButton = screen.getByRole('button', { name: /upload/i });
    expect(uploadButton).toBeInTheDocument();
  });

  it('should show cancel button', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeInTheDocument();
  });

  it('should handle URL input', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    const urlInput = screen.getByPlaceholderText(/enter url/i);
    expect(urlInput).toBeInTheDocument();

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/image.jpg' },
    });
    expect(urlInput).toHaveValue('https://example.com/image.jpg');
  });

  it('should display dropzone area', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByText(/drag.*drop.*files here/i)).toBeInTheDocument();
  });

  it('should show appropriate max size for images', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByText(/max.*10.*mb/i)).toBeInTheDocument();
  });

  it('should show appropriate max size for videos', () => {
    render(<ModalUpload type="video" onConfirm={mockOnConfirm} />);

    expect(screen.getByText(/max.*50.*mb/i)).toBeInTheDocument();
  });

  it('should show appropriate max size for audio', () => {
    render(<ModalUpload type="voice" onConfirm={mockOnConfirm} />);

    expect(screen.getByText(/max.*25.*mb/i)).toBeInTheDocument();
  });

  it('should show max files limit', () => {
    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
        maxFiles={3}
      />,
    );

    expect(screen.getByText(/max.*3.*files/i)).toBeInTheDocument();
  });

  it('should call onConfirm when cancel is clicked', async () => {
    const { closeModal } = await import('@helpers/ui/modal/modal.helper');

    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(closeModal).toHaveBeenCalled();
      expect(mockOnConfirm).toHaveBeenCalled();
    });
  });

  it('should handle image-to-video type', () => {
    render(<ModalUpload type="image-to-video" onConfirm={mockOnConfirm} />);

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
    expect(screen.getByText(/max.*50.*mb/i)).toBeInTheDocument();
  });

  it('should handle music type', () => {
    render(<ModalUpload type="music" onConfirm={mockOnConfirm} />);

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
    expect(screen.getByText(/max.*25.*mb/i)).toBeInTheDocument();
  });

  it('should set max files to 1 for logo type', () => {
    render(<ModalUpload type="logo" onConfirm={mockOnConfirm} />);

    expect(screen.getByText(/max.*1.*file/i)).toBeInTheDocument();
  });

  it('should set max files to 1 for banner type', () => {
    render(<ModalUpload type="banner" onConfirm={mockOnConfirm} />);

    expect(screen.getByText(/max.*1.*file/i)).toBeInTheDocument();
  });

  it('should handle reference asset type', () => {
    render(
      <ModalUpload
        category={AssetCategory.REFERENCE}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId('modal-upload')).toBeInTheDocument();
    expect(screen.getByText(/max.*10.*mb/i)).toBeInTheDocument();
  });

  it('should disable upload button when submitting', () => {
    const useFormSubmitWithState = vi.fn(() => ({
      isSubmitting: true,
      onSubmit: vi.fn(),
    }));

    vi.doMock('@hooks/utils/use-form-submit', () => ({
      useFormSubmitWithState,
    }));

    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        onConfirm={mockOnConfirm}
      />,
    );

    const uploadButton = screen.getByRole('button', { name: /upload/i });
    expect(uploadButton).toBeDisabled();
  });
});
