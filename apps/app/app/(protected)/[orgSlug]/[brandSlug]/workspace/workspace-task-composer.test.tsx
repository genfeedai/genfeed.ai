import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceBrandMentionList } from './workspace-task-brand-mention-list';
import { WorkspaceTaskComposer } from './workspace-task-composer';
import {
  extractBrandMentionMatch,
  getBrandDisplayLabel,
} from './workspace-task-composer.helpers';

const mocks = vi.hoisted(() => ({
  brandUpdateAgentConfig: vi.fn(),
  brandContext: {
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Moonrise Studio', name: null },
      { id: 'brand-2', label: 'Solar Studio', name: null },
    ],
    organizationId: 'org-1',
    selectedBrand: {
      agentConfig: {
        heygenAvatarId: 'avatar-default',
        heygenVoiceId: 'voice-default',
      },
      id: 'brand-1',
      label: 'Moonrise Studio',
      name: null,
    },
  },
  clearContent: vi.fn(),
  createTask: vi.fn(),
  editorOptions: undefined as
    | {
        onUpdate?: (props: { editor: { getJSON: () => unknown } }) => void;
      }
    | undefined,
  fetch: vi.fn(),
  getClonedVoices: vi.fn(),
  getToken: vi.fn(),
  loggerError: vi.fn(),
  onOpenChange: vi.fn(),
  onTaskCreated: vi.fn(),
  promptPost: vi.fn(),
  resolveAuthToken: vi.fn(),
  websocketOptions: undefined as
    | {
        onError: () => void;
        onSuccess: (result: string) => void;
        onTimeout: () => void;
      }
    | undefined,
  websocketPrompt: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandContext,
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveAuthToken: mocks.resolveAuthToken,
}));

vi.mock('@hooks/utils/use-websocket-prompt/use-websocket-prompt', () => ({
  useWebsocketPrompt: (options: {
    onError: () => void;
    onSuccess: (result: string) => void;
    onTimeout: () => void;
  }) => {
    mocks.websocketOptions = options;
    return mocks.websocketPrompt;
  },
}));

vi.mock('@services/content/prompts.service', () => ({
  PromptsService: {
    getInstance: () => ({
      post: mocks.promptPost,
    }),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.example.test',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/ingredients/voice-clone.service', () => ({
  VoiceCloneService: {
    getInstance: () => ({
      getClonedVoices: mocks.getClonedVoices,
    }),
  },
}));

vi.mock('@services/management/tasks.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/management/tasks.service')
  >('@services/management/tasks.service');

  return {
    ...actual,
    TasksService: {
      getInstance: () => ({
        createTask: mocks.createTask,
      }),
    },
  };
});

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({
      updateAgentConfig: mocks.brandUpdateAgentConfig,
    }),
  },
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: () => <div data-testid="target-brand-editor" />,
  ReactRenderer: class {
    public element = document.createElement('div');
    public ref = { onKeyDown: vi.fn() };
    public destroy() {}
    public updateProps() {}
  },
  useEditor: (options: {
    onUpdate?: (props: { editor: { getJSON: () => unknown } }) => void;
  }) => {
    mocks.editorOptions = options;
    return {
      commands: {
        clearContent: mocks.clearContent,
      },
      getJSON: () => ({ content: [] }),
      options: {
        editorProps: {
          attributes: {
            'aria-label': 'Target brand',
          },
        },
      },
    };
  },
}));

vi.mock('@ui/modals/compound/modal.compound', () => ({
  Modal: {
    Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    CloseButton: ({ children }: { children: ReactNode }) => <>{children}</>,
    Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Description: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    Footer: ({ children }: { children: ReactNode }) => (
      <footer>{children}</footer>
    ),
    Header: ({ children }: { children: ReactNode }) => (
      <header>{children}</header>
    ),
    Root: ({
      children,
      onOpenChange,
      open,
    }: {
      children: ReactNode;
      onOpenChange: (open: boolean) => void;
      open: boolean;
    }) =>
      open ? (
        <section role="dialog">
          <button type="button" onClick={() => onOpenChange(false)}>
            Mock Close
          </button>
          {children}
        </section>
      ) : null,
    Title: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    disabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={disabled} type={type} onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    isChecked,
    label,
    onCheckedChange,
  }: {
    isChecked?: boolean;
    label: string;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <label>
      <input
        checked={isChecked}
        type="checkbox"
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="">{placeholder}</option>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    onChange,
    onKeyDown,
    placeholder,
    value,
  }: {
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    value: string;
  }) => (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

vi.mock('tippy.js', () => ({
  default: () => [
    {
      destroy: vi.fn(),
      hide: vi.fn(),
      setProps: vi.fn(),
    },
  ],
}));

function renderComposer() {
  render(
    <WorkspaceTaskComposer
      open
      onOpenChange={mocks.onOpenChange}
      onTaskCreated={mocks.onTaskCreated}
    />,
  );
}

function fillRequest(value: string) {
  fireEvent.change(
    screen.getByPlaceholderText(/create three thumbnail directions/i),
    {
      target: { value },
    },
  );
}

describe('WorkspaceTaskComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandContext = {
      brandId: 'brand-1',
      brands: [
        { id: 'brand-1', label: 'Moonrise Studio', name: null },
        { id: 'brand-2', label: 'Solar Studio', name: null },
      ],
      organizationId: 'org-1',
      selectedBrand: {
        agentConfig: {
          heygenAvatarId: 'avatar-default',
          heygenVoiceId: 'voice-default',
        },
        id: 'brand-1',
        label: 'Moonrise Studio',
        name: null,
      },
    };
    mocks.editorOptions = undefined;
    mocks.websocketOptions = undefined;
    mocks.getToken.mockResolvedValue('clerk-token');
    mocks.resolveAuthToken.mockResolvedValue('api-token');
    mocks.createTask.mockResolvedValue({
      id: 'task-1',
      request: 'Create a product launch brief',
      title: 'Create a product launch brief',
    });
    mocks.promptPost.mockResolvedValue({ id: 'prompt-1' });
    mocks.websocketPrompt.mockReturnValue(undefined);
    mocks.getClonedVoices.mockResolvedValue([
      {
        id: 'voice-cloned',
        metadataLabel: 'Narrator',
        provider: 'elevenlabs',
      },
    ]);
    mocks.fetch.mockImplementation((url: RequestInfo | URL) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.endsWith('/heygen/avatars')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                attributes: {
                  avatars: [
                    {
                      avatarId: 'avatar-default',
                      name: 'Default Avatar',
                      preview: 'https://cdn.example.test/avatar.jpg',
                    },
                  ],
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (href.endsWith('/heygen/voices')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                attributes: {
                  voices: [{ name: 'Default Voice', voiceId: 'voice-default' }],
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('validates, enhances, undoes, and creates a standard task', async () => {
    renderComposer();

    expect(screen.getByRole('heading', { name: 'New Task' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /create task/i }));
    expect(
      screen.getByText('Describe what you want Genfeed to create.'),
    ).toBeVisible();

    fillRequest('Create a product launch brief');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(mocks.promptPost).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          organization: 'org-1',
          original: 'Create a product launch brief',
          useRAG: true,
        }),
      );
      expect(mocks.websocketPrompt).toHaveBeenCalledWith('prompt-1');
    });

    act(() => {
      mocks.websocketOptions?.onSuccess('Create a launch brief with hooks.');
    });
    expect(
      await screen.findByDisplayValue('Create a launch brief with hooks.'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.getByDisplayValue('Create a product launch brief'),
    ).toBeVisible();

    fireEvent.click(screen.getByLabelText('Add another task'));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          outputType: 'ingredient',
          request: 'Create a product launch brief',
          title: 'Create a product launch brief',
        }),
      );
      expect(mocks.onTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1' }),
      );
      expect(mocks.onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  it('creates research and trends tasks with mode-specific prompts', async () => {
    renderComposer();
    fillRequest('Evaluate our new creator niche');

    fireEvent.click(screen.getByRole('button', { name: 'Research' }));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          outputType: 'ingredient',
          request: expect.stringContaining(
            'Research this request for Moonrise Studio',
          ),
          title: 'Research brief - Moonrise Studio',
        }),
      ),
    );

    fillRequest('Find creator economy angles');
    fireEvent.click(screen.getByRole('button', { name: 'Trends' }));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.stringContaining(
            'Analyze current trends relevant to Moonrise Studio',
          ),
          title: 'Trends report - Moonrise Studio',
        }),
      ),
    );
  });

  it('creates a facecam task and saves selected voice defaults', async () => {
    renderComposer();
    fillRequest('Record a facecam intro');

    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        'https://api.example.test/heygen/avatars',
        expect.objectContaining({
          headers: { Authorization: 'Bearer api-token' },
        }),
      );
      expect(mocks.getClonedVoices).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText('Save as brand default'));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          heygenAvatarId: 'avatar-default',
          outputType: 'facecam',
          request: 'Record a facecam intro',
          voiceId: 'voice-default',
          voiceProvider: 'heygen',
        }),
      );
      expect(mocks.brandUpdateAgentConfig).toHaveBeenCalledWith('brand-1', {
        heygenAvatarId: 'avatar-default',
        heygenVoiceId: 'voice-default',
      });
    });
  });

  it('targets a mentioned brand, clears it, and submits with Cmd+Enter', async () => {
    renderComposer();
    fillRequest('Create a cross-brand caption');

    act(() => {
      mocks.editorOptions?.onUpdate?.({
        editor: {
          getJSON: () => ({
            content: [
              {
                content: [
                  {
                    attrs: { id: 'brand-2', label: 'Solar Studio' },
                    type: 'mention',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          }),
        },
      });
    });

    expect(screen.getByText('Solar Studio')).toBeVisible();
    fireEvent.keyDown(
      screen.getByPlaceholderText(/create three thumbnail directions/i),
      {
        key: 'Enter',
        metaKey: true,
      },
    );

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-2',
          request: 'Create a cross-brand caption',
        }),
      ),
    );

    act(() => {
      mocks.editorOptions?.onUpdate?.({
        editor: {
          getJSON: () => ({
            content: [
              {
                content: [{ attrs: { id: 'brand-2' }, type: 'mention' }],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          }),
        },
      });
    });
    expect(screen.getByText('brand-2')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mocks.clearContent).toHaveBeenCalled();
  });

  it('uses manually selected facecam voice provider and logs default-save failures', async () => {
    mocks.brandUpdateAgentConfig.mockRejectedValueOnce(
      new Error('defaults failed'),
    );
    renderComposer();
    fillRequest('Record a cloned facecam intro');
    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));

    await screen.findByText('[ElevenLabs] Narrator');
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'avatar-default' },
    });
    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: 'voice-cloned' },
    });
    fireEvent.click(screen.getByLabelText('Save as brand default'));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: 'voice-cloned',
          voiceProvider: 'elevenlabs',
        }),
      );
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to persist brand voice defaults',
        expect.any(Error),
      );
      expect(mocks.onTaskCreated).toHaveBeenCalled();
    });
  });

  it('surfaces auth, facecam load, enhancement, and create failures', async () => {
    mocks.resolveAuthToken.mockResolvedValueOnce(null);
    renderComposer();
    fillRequest('Create a product image');

    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    expect(
      await screen.findByText('Authentication token unavailable.'),
    ).toBeVisible();

    mocks.resolveAuthToken.mockResolvedValue('api-token');
    mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));
    expect(
      await screen.findByText(/HeyGen API key missing or invalid/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    act(() => {
      mocks.websocketOptions?.onError();
    });
    expect(screen.getByRole('button', { name: /enhance/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    act(() => {
      mocks.websocketOptions?.onTimeout();
    });
    expect(screen.getByRole('button', { name: /enhance/i })).toBeEnabled();

    mocks.createTask.mockRejectedValueOnce(new Error('create failed'));
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));
    expect(await screen.findByText('create failed')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Mock Close' }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces prompt service failures during enhancement', async () => {
    renderComposer();
    fillRequest('Enhance this task');
    mocks.promptPost.mockRejectedValueOnce(new Error('prompt failed'));
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    expect(await screen.findByText('prompt failed')).toBeVisible();
  });

  it('surfaces missing org, missing create auth, non-500 facecam responses, and clone fetch failures', async () => {
    mocks.brandContext = {
      ...mocks.brandContext,
      organizationId: null,
    };
    renderComposer();
    fillRequest('Create a launch image');

    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    expect(
      await screen.findByText('Organization context unavailable.'),
    ).toBeVisible();

    mocks.brandContext = {
      ...mocks.brandContext,
      organizationId: 'org-1',
    };
    mocks.resolveAuthToken.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));
    expect(
      await screen.findByText('Authentication token unavailable.'),
    ).toBeVisible();

    mocks.resolveAuthToken.mockResolvedValue('api-token');
    mocks.fetch
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));
    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));
    expect(await screen.findByText('Avatars: 404, Voices: 403')).toBeVisible();

    mocks.fetch.mockRejectedValueOnce(new Error('network failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));
    expect(await screen.findByText('network failed')).toBeVisible();
  });

  it('requires facecam identity when no avatar or voice defaults are available', async () => {
    mocks.brandContext = {
      ...mocks.brandContext,
      selectedBrand: {
        id: 'brand-1',
        label: 'Moonrise Studio',
        name: null,
      },
    };
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    renderComposer();
    fillRequest('Record a facecam intro');

    fireEvent.click(screen.getByRole('button', { name: 'Facecam' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    expect(
      await screen.findByText(
        'Select an avatar and voice, or configure brand identity defaults in Settings.',
      ),
    ).toBeVisible();
  });

  it('covers brand mention helper and suggestion list behavior', () => {
    expect(getBrandDisplayLabel({ name: 'Named Brand' })).toBe('Named Brand');
    expect(getBrandDisplayLabel()).toBe('Selected brand');
    expect(extractBrandMentionMatch(null)).toBeNull();
    expect(
      extractBrandMentionMatch({
        content: [
          {
            content: [
              {
                attrs: { id: 'brand-2', label: '  ' },
                type: 'mention',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      }),
    ).toEqual({ id: 'brand-2', label: 'Brand' });

    const command = vi.fn();
    const { rerender } = render(
      <WorkspaceBrandMentionList command={command} items={[]} />,
    );
    expect(screen.getByText('No brands found')).toBeVisible();

    rerender(
      <WorkspaceBrandMentionList
        command={command}
        items={[{ id: 'brand-1', label: 'Moonrise Studio' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '@Moonrise Studio' }));
    expect(command).toHaveBeenCalledWith({
      id: 'brand-1',
      label: 'Moonrise Studio',
    });
  });
});
