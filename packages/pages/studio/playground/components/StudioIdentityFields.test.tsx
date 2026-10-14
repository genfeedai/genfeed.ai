import { RouterPriority, VoiceProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
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
class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

vi.mock('@pages/studio/playground/hooks/useStudioPlaygroundIdentities', () => ({
  useStudioPlaygroundIdentities: (params: unknown) => mocks.identities(params),
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
  hasHeyGenPersonalConnection: true,
  hasHeyGenSpeechVoices: false,
  isHeyGenSpeechLoaded: false,
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
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    for (const key of pointerApiKeys) {
      Object.defineProperty(Element.prototype, key, {
        configurable: true,
        value: key === 'hasPointerCapture' ? () => false : () => undefined,
        writable: true,
      });
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
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

  describe('Voice type', () => {
    const heyGenVoiceRef = {
      source: 'catalog',
      provider: VoiceProvider.HEYGEN,
      externalVoiceId: 'clone-1',
      ownership: 'private',
    } as const;
    const heyGenVoiceOption = {
      label: 'Founder clone (HeyGen Voice · private)',
      value: 'heygen:private:clone-1',
      voiceRef: heyGenVoiceRef,
    };

    it('asks the identity source for voices narrowed to the chosen speech model', () => {
      mocks.identities.mockReturnValue({ ...identities, error: null });
      render(
        <StudioIdentityFields
          settings={{ ...settings, modelKey: MODEL_KEYS.HEYGEN_VOICE }}
          type="voice"
          onChange={vi.fn()}
        />,
      );

      expect(mocks.identities).toHaveBeenLastCalledWith({
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        type: 'voice',
      });
    });

    it('selects a HeyGen Voice voice together with its provider and ownership', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        hasHeyGenSpeechVoices: true,
        isHeyGenSpeechLoaded: true,
        voiceOptions: [heyGenVoiceOption],
      });
      render(
        <StudioIdentityFields
          settings={settings}
          type="voice"
          onChange={onChange}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Identity' }));
      await user.click(
        screen.getByRole('button', {
          name: 'Founder clone (HeyGen Voice · private)',
        }),
      );

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        voiceRef: heyGenVoiceRef,
        voiceId: 'clone-1',
      });
    });

    it.each([
      [
        'asks to connect HeyGen when there is no personal connection',
        false,
        'No HeyGen Voice voices available. Connect your HeyGen account in Settings → Integrations to use your own voice clones.',
      ],
      [
        'asks to create a clone when connected without active clones',
        true,
        'No active HeyGen Voice clones yet. Create one in HeyGen, then reopen this picker.',
      ],
    ])(
      'explains an empty HeyGen Voice catalogue: %s',
      async (_label, hasPersonalConnection, message) => {
        const user = userEvent.setup();
        mocks.identities.mockReturnValue({
          ...identities,
          error: null,
          hasHeyGenPersonalConnection: hasPersonalConnection,
          hasHeyGenSpeechVoices: false,
          isHeyGenSpeechLoaded: true,
          voiceOptions: [],
        });
        render(
          <StudioIdentityFields
            settings={{ ...settings, modelKey: MODEL_KEYS.HEYGEN_VOICE }}
            type="voice"
            onChange={vi.fn()}
          />,
        );
        await user.click(screen.getByRole('button', { name: 'Identity' }));

        expect(screen.getByRole('status')).toHaveTextContent(message);
      },
    );

    it('keeps the generic empty state when HeyGen Voice is not the chosen model', async () => {
      const user = userEvent.setup();
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        hasHeyGenSpeechVoices: false,
        isHeyGenSpeechLoaded: true,
        voiceOptions: [],
      });
      render(
        <StudioIdentityFields
          settings={{ ...settings, modelKey: MODEL_KEYS.ELEVENLABS_V4 }}
          type="voice"
          onChange={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Identity' }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText(/^No voices available\./)).toBeVisible();
    });

    it('does not claim HeyGen has no voices when the fetch failed', async () => {
      const user = userEvent.setup();
      mocks.identities.mockReturnValue({
        ...identities,
        error: 'HeyGen Voice voices could not be loaded.',
        hasHeyGenSpeechVoices: false,
        isHeyGenSpeechLoaded: false,
        voiceOptions: [],
      });
      render(
        <StudioIdentityFields
          settings={{ ...settings, modelKey: MODEL_KEYS.HEYGEN_VOICE }}
          type="voice"
          onChange={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Identity' }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'HeyGen Voice voices could not be loaded.',
      );
    });

    it('clears a saved voice the chosen speech model cannot speak', () => {
      mocks.identities.mockReturnValue({ ...identities, error: null });
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            modelKey: MODEL_KEYS.HEYGEN_VOICE,
            voiceId: 'voice-1',
            voiceRef: identities.voiceOptions[0].voiceRef,
          }}
          type="voice"
          onChange={onChange}
        />,
      );

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        voiceRef: undefined,
        voiceId: undefined,
      });
    });

    it('clears a saved HeyGen voice that is no longer in the loaded catalogue', () => {
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        hasHeyGenSpeechVoices: false,
        isHeyGenSpeechLoaded: true,
        voiceOptions: [],
      });
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            voiceId: 'stock-voice',
            voiceRef: { ...heyGenVoiceRef, externalVoiceId: 'stock-voice' },
          }}
          type="voice"
          onChange={onChange}
        />,
      );

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        voiceRef: undefined,
        voiceId: undefined,
      });
    });

    it('keeps a saved voice that matches the chosen model and the catalogue', () => {
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        hasHeyGenSpeechVoices: true,
        isHeyGenSpeechLoaded: true,
        voiceOptions: [heyGenVoiceOption],
      });
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            modelKey: MODEL_KEYS.HEYGEN_VOICE,
            voiceId: 'clone-1',
            voiceRef: heyGenVoiceRef,
          }}
          type="voice"
          onChange={onChange}
        />,
      );

      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps a saved HeyGen voice while its catalogue has not loaded', () => {
      mocks.identities.mockReturnValue({
        ...identities,
        isHeyGenSpeechLoaded: false,
        voiceOptions: [],
      });
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            voiceId: 'clone-1',
            voiceRef: heyGenVoiceRef,
          }}
          type="voice"
          onChange={onChange}
        />,
      );

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
