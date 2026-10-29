import {
  AssetCategory,
  AssetScope,
  IngredientCategory,
  UploadStatus,
} from '@genfeedai/contracts';
import type { FileUploadStatus } from '@genfeedai/contracts/interfaces/modals/file-upload-status.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalUpload from '@ui/modals/ingredients/upload/ModalUpload';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeModalUpload: vi.fn(),
  setScope: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      ui: {
        uploadModal: {
          browse: 'browse',
          cancel: 'Cancel',
          cloneVoice: 'Clone voice',
          cloneVoiceTitle: 'Clone voice',
          dropPrompt: 'Drop files here or',
          fileCount: '{count} of {max} files',
          maxSizeEach: '{size} MB each',
          singleFile: 'Single file',
          statusFailed: 'Upload failed',
          statusUploaded: 'Uploaded',
          statusWaiting: 'Waiting',
          title: 'Upload {category}',
          upToFiles: 'Up to {count}',
          upload:
            '{count, plural, =0 {Upload} one {Upload # file} other {Upload # files}}',
          uploadingFile: 'Uploading {name}',
        },
      },
    }),
  };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children, title }: PropsWithChildren<{ title?: string }>) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock(
  '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input',
  () => ({
    useFocusFirstInput: () => ({ current: null }),
  }),
);

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock('@genfeedai/hooks/utils/use-form-submit/use-form-submit', () => ({
  useFormSubmitWithState: () => ({ isSubmitting: false, onSubmit: vi.fn() }),
}));

vi.mock('@ui/modals/ingredients/upload/useModalUpload', () => ({
  useModalUpload: () => mocks.state,
}));

vi.mock('@ui/modals/ingredients/upload/UploadVoiceCloneSection', () => ({
  __esModule: true,
  default: () => <div data-testid="voice-clone-section" />,
}));

function makeFile(name: string, size: number, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    acceptedTypes: ['.jpg', '.png', '.webp'],
    closeModalUpload: mocks.closeModalUpload,
    dimensionText: '',
    dimensionWarning: null,
    error: null,
    fileStatuses: new Map<string, FileUploadStatus>(),
    formatSize: (bytes: number) => `${bytes} B`,
    getInputProps: (props: object) => ({ ...props, type: 'file' }),
    getRootProps: (props: object) => props,
    handleSubmit: vi.fn(),
    isVoiceLike: false,
    maxFiles: 10,
    maxSize: 50,
    scope: AssetScope.USER,
    selectedFileList: [] as File[],
    setError: vi.fn(),
    setScope: mocks.setScope,
    urlValue: '',
    voiceCloneName: '',
    ...overrides,
  };
}

describe('ModalUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    mocks.state = baseState();
  });

  it('shows one drop zone with the requirements as chips and no file rows', () => {
    render(
      <ModalUpload category={IngredientCategory.IMAGE} onComplete={vi.fn()} />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Upload image' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Drop files here or')).toBeInTheDocument();
    expect(screen.getByText('Up to 10')).toBeInTheDocument();
    expect(screen.getByText('50 MB each')).toBeInTheDocument();
    expect(screen.getByText('JPG · PNG · WEBP')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('lists each file with its own state and counts the files in the footer', () => {
    const waiting = makeFile('waiting.png', 10);
    const sending = makeFile('sending.png', 20);
    const done = makeFile('done.png', 30);
    const failed = makeFile('failed.png', 40);
    mocks.state = baseState({
      fileStatuses: new Map<string, FileUploadStatus>([
        [
          'a',
          {
            file: sending,
            id: 'a',
            progress: 62,
            status: UploadStatus.UPLOADING,
          },
        ],
        [
          'b',
          {
            file: done,
            id: 'b',
            progress: 100,
            status: UploadStatus.COMPLETED,
          },
        ],
        [
          'c',
          {
            error: 'Server rejected the file',
            file: failed,
            id: 'c',
            progress: 0,
            status: UploadStatus.FAILED,
          },
        ],
      ]),
      selectedFileList: [waiting, sending, done, failed],
    });

    render(
      <ModalUpload category={IngredientCategory.IMAGE} onComplete={vi.fn()} />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Server rejected the file')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Uploading sending.png' }),
    ).toHaveAttribute('aria-valuenow', '62');
    expect(screen.getByText('4 of 10 files')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upload 4 files' }),
    ).toBeEnabled();
  });

  it('previews image files and releases the preview when the row goes away', () => {
    mocks.state = baseState({ selectedFileList: [makeFile('shot.png', 5)] });

    const { unmount } = render(
      <ModalUpload category={IngredientCategory.IMAGE} onComplete={vi.fn()} />,
    );

    expect(screen.getByTestId('upload-file-thumb')).toHaveStyle({
      backgroundImage: 'url("blob:preview")',
    });
    expect(
      screen.getByRole('button', { name: 'Upload 1 file' }),
    ).toBeInTheDocument();

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('uses the single-file wording and hides the count when only one file is allowed', () => {
    mocks.state = baseState({ maxFiles: 1 });

    render(
      <ModalUpload
        category={IngredientCategory.IMAGE}
        isMultiple={false}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText('Single file')).toBeInTheDocument();
    expect(screen.queryByText(/of 1 files/)).not.toBeInTheDocument();
  });

  it('switches the access scope from the segmented control', () => {
    render(
      <ModalUpload category={IngredientCategory.IMAGE} onComplete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Organization' }));

    expect(mocks.setScope).toHaveBeenCalledWith(AssetScope.ORGANIZATION);
  });

  it('closes from the ghost Cancel button', () => {
    render(
      <ModalUpload category={IngredientCategory.IMAGE} onComplete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.closeModalUpload).toHaveBeenCalledTimes(1);
  });

  it.each([AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE])(
    'does not ask for an access scope on %s uploads',
    (category) => {
      render(<ModalUpload category={category} onComplete={vi.fn()} />);

      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    },
  );

  it('renders the voice clone flow with its own title and action', () => {
    mocks.state = baseState({
      isVoiceLike: true,
      selectedFileList: [makeFile('sample.wav', 5, 'audio/wav')],
      voiceCloneName: 'Narrator',
    });

    render(
      <ModalUpload category={IngredientCategory.VOICE} onComplete={vi.fn()} />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Clone voice' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('voice-clone-section')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clone voice' })).toBeEnabled();
  });
});
