import { RouterPriority, VoiceProvider } from '@genfeedai/contracts';
import StudioIdentityFields from '@pages/studio/playground/components/StudioIdentityFields';
import type { UseStudioPlaygroundIdentitiesReturn } from '@pages/studio/playground/hooks/useStudioPlaygroundIdentities';
import type { StudioPlaygroundSettings } from '@pages/studio/playground/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({ identities: vi.fn() }));
vi.mock('@pages/studio/playground/hooks/useStudioPlaygroundIdentities', () => ({
  useStudioPlaygroundIdentities: () => mocks.identities(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const settings: StudioPlaygroundSettings = {
  aspectRatio: '1:1',
  blacklist: [],
  brandingMode: 'brand',
  isAudioEnabled: false,
  modelKey: 'auto',
  outputs: 1,
  prioritize: RouterPriority.BALANCED,
  resolution: '1K',
  tags: [],
};
const identities: UseStudioPlaygroundIdentitiesReturn = {
  retry: vi.fn(),
  hasMoreAvatars: false,
  isLoadingMoreAvatars: false,
  loadMoreAvatars: vi.fn().mockResolvedValue(undefined),
  avatarOptions: [
    {
      label: 'Saved photo',
      value: 'https://assets.test/photo.jpg',
      preview: 'https://assets.test/photo.jpg',
    },
  ],
  error:
    'HeyGen identities could not be loaded. Check your connection in Integrations.',
  isLoadingIdentities: false,
  voiceOptions: [
    {
      label: 'Saved voice (ELEVENLABS)',
      value: 'ELEVENLABS:voice-1',
      preview: 'https://assets.test/sample.mp3',
      voiceRef: {
        source: 'catalog',
        provider: VoiceProvider.ELEVENLABS,
        externalVoiceId: 'voice-1',
      },
    },
  ],
};

describe('Studio identity catalog recovery', () => {
  const pointerApiKeys = [
    'hasPointerCapture',
    'setPointerCapture',
    'releasePointerCapture',
    'scrollIntoView',
  ] as const;
  const pointerApiDescriptors = pointerApiKeys.map(
    (key) =>
      [key, Object.getOwnPropertyDescriptor(Element.prototype, key)] as const,
  );

  beforeAll(() => {
    for (const key of pointerApiKeys) {
      Object.defineProperty(Element.prototype, key, {
        configurable: true,
        value: key === 'hasPointerCapture' ? () => false : () => undefined,
        writable: true,
      });
    }
  });

  afterAll(() => {
    for (const [key, descriptor] of pointerApiDescriptors) {
      if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
      else Reflect.deleteProperty(Element.prototype, key);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identities.mockReturnValue(identities);
  });

  it('explains a provider outage while keeping available photo and voice choices usable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      identities.error as string,
    );
    expect(screen.getByRole('button', { name: 'Saved photo' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Saved voice (ELEVENLABS)' }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Saved voice (ELEVENLABS)' }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      voiceRef: identities.voiceOptions[0].voiceRef,
      voiceId: 'voice-1',
    });
  });

  it('renders independent preview and selection controls, with explicit saved defaults', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={{
          ...settings,
          avatarPhotoUrl: 'chosen',
          voiceId: 'voice-1',
          voiceRef: identities.voiceOptions[0].voiceRef,
        }}
        type="avatar"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Play preview for Saved voice (ELEVENLABS)',
      }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Pause preview for Saved voice (ELEVENLABS)',
      }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Saved photo' }));
    expect(onChange).toHaveBeenLastCalledWith({
      avatarRef: undefined,
      avatarPhotoUrl: 'https://assets.test/photo.jpg',
    });
    await user.click(
      screen.getByRole('button', { name: 'Use saved avatar default' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      avatarRef: undefined,
      avatarPhotoUrl: undefined,
    });
    await user.click(
      screen.getByRole('button', { name: 'Use saved voice default' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      voiceRef: undefined,
      voiceId: undefined,
    });
  });

  it('keeps unready native avatars and all identity changes disabled when required', async () => {
    const user = userEvent.setup();
    mocks.identities.mockReturnValue({
      ...identities,
      avatarOptions: [{ label: 'Not ready', value: 'look', disabled: true }],
    });
    const view = render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.getByRole('button', { name: 'Not ready' })).toBeDisabled();
    view.rerender(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
        isDisabled
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Saved voice (ELEVENLABS)' }),
    ).toBeDisabled();
  });

  it('removes the outage notice when the catalog recovers', async () => {
    mocks.identities.mockReturnValue({ ...identities, error: null });
    const user = userEvent.setup();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('bounds large catalogues and searches without changing the selected identity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mocks.identities.mockReturnValue({
      ...identities,
      error: null,
      voiceOptions: Array.from({ length: 25 }, (_, index) => ({
        ...identities.voiceOptions[0],
        label: `Voice ${index + 1}`,
        value: `voice-${index + 1}`,
      })),
    });
    render(
      <StudioIdentityFields
        settings={settings}
        type="voice"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(
      screen.queryByRole('button', { name: 'Voice 13' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More voices' }));
    expect(screen.getByRole('button', { name: 'Voice 13' })).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: 'Search avatars and voices' }),
      'Voice 25',
    );
    expect(screen.getByRole('button', { name: 'Voice 25' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Voice 1' }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('retries the catalogue explicitly without changing the selected identity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    await user.click(
      screen.getByRole('button', { name: 'Retry HeyGen identities' }),
    );
    expect(identities.retry).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps healthy photo and voice choices usable while the remote catalogue retries', async () => {
    mocks.identities.mockReturnValue({
      ...identities,
      isLoadingIdentities: true,
    });
    const user = userEvent.setup();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.getByRole('button', { name: 'Saved photo' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Saved voice (ELEVENLABS)' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Retry HeyGen identities' }),
    ).toBeDisabled();
  });
  it('loads another provider page only when the user requests more avatars', async () => {
    const loadMoreAvatars = vi.fn().mockResolvedValue(undefined);
    mocks.identities.mockReturnValue({
      ...identities,
      error: null,
      hasMoreAvatars: true,
      loadMoreAvatars,
    });
    render(
      <StudioIdentityFields
        type="avatar"
        settings={settings}
        onChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Identity' }));
    expect(loadMoreAvatars).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'More avatars' }));
    expect(loadMoreAvatars).toHaveBeenCalledOnce();
  });
});
