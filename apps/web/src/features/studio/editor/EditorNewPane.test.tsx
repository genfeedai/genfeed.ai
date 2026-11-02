import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorNewPane from './EditorNewPane';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getService: vi.fn(),
  loggerError: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/editor/editor-projects.service', () => ({
  EditorProjectsService: { getInstance: vi.fn() },
}));

// The rich-text editor needs a real DOM layout; a textarea keeps these tests on
// the pane's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    isDisabled,
    onSubmit,
    onValueChange,
    placeholder,
    value,
  }: {
    ariaLabel?: string;
    isDisabled?: boolean;
    onSubmit?: () => void;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

function nameBox() {
  return screen.getByRole('textbox', { name: 'Project name' });
}

function sendButton() {
  return screen.getByRole('button', { name: 'Create project' });
}

describe('EditorNewPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.getService.mockResolvedValue({ create: mocks.create });
    mocks.create.mockResolvedValue({ id: 'project-1' });
  });

  it('opens with the starters and an empty name', () => {
    render(<EditorNewPane />);

    expect(
      screen.getByRole('heading', { name: 'What are we editing?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Landscape video/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Vertical short/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Square post/ }),
    ).toBeInTheDocument();
    expect(nameBox()).toHaveValue('');
    expect(sendButton()).toBeEnabled();
  });

  it('starts an untitled landscape project and opens it', async () => {
    render(<EditorNewPane />);

    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/editor/project-1'),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Untitled Project',
      settings: { format: 'landscape', height: 1080, width: 1920 },
      sourceVideoIds: [],
    });
  });

  it('fills the name and the canvas from a starter without creating anything', async () => {
    render(<EditorNewPane />);

    fireEvent.click(screen.getByRole('button', { name: /Vertical short/ }));

    expect(nameBox()).toHaveValue('Vertical short');
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.click(sendButton());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Vertical short',
      settings: { format: 'portrait', height: 1920, width: 1080 },
      sourceVideoIds: [],
    });
  });

  it('names the project after a typed prompt on the chosen canvas', async () => {
    render(<EditorNewPane />);

    fireEvent.change(nameBox(), { target: { value: '  Launch teaser  ' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Format' }));
    fireEvent.click(screen.getByRole('option', { name: '1:1' }));
    fireEvent.click(sendButton());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Launch teaser',
      settings: { format: 'square', height: 1080, width: 1080 },
      sourceVideoIds: [],
    });
  });

  it('starts the timeline from every ?video= in URL order', async () => {
    mocks.searchParams = new URLSearchParams(
      'video=shot-2&video=shot-1&video=shot-3',
    );
    render(<EditorNewPane />);

    expect(
      screen.getByText('3 videos are ready to open on the timeline, in order.'),
    ).toBeInTheDocument();

    fireEvent.click(sendButton());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Video Edit',
      settings: { format: 'landscape', height: 1080, width: 1920 },
      sourceVideoIds: ['shot-2', 'shot-1', 'shot-3'],
    });
  });

  it('refuses a name longer than 120 characters', () => {
    render(<EditorNewPane />);

    fireEvent.change(nameBox(), { target: { value: 'a'.repeat(121) } });

    expect(
      screen.getByText('Keep the name under 120 characters.'),
    ).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('stays on the pane and says so when the project cannot be created', async () => {
    mocks.create.mockRejectedValue(new Error('Source video not found'));
    render(<EditorNewPane />);

    fireEvent.click(sendButton());

    expect(
      await screen.findByText('Could not create the project. Try again.'),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to create editor project',
      expect.any(Error),
    );
    expect(sendButton()).toBeEnabled();
  });
});
