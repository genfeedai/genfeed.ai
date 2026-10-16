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

const mocks = vi.hoisted(() => ({ brand: vi.fn(), identities: vi.fn() }));
class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

vi.mock('@pages/studio/playground/hooks/useStudioPlaygroundIdentities', () => ({
  useStudioPlaygroundIdentities: (params: unknown) => mocks.identities(params),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand(),
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
      name: 'Saved photo',
      source: 'Photo',
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
      name: 'Saved voice',
      source: 'ELEVENLABS',
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
    mocks.brand.mockReturnValue({ selectedBrand: undefined });
  });

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Identity' }));
  }

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
    await openPicker(user);
    expect(screen.getByRole('alert')).toHaveTextContent(
      identities.error as string,
    );
    expect(screen.getByRole('button', { name: 'Saved photo' })).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: /^Voice/ }));
    await user.click(screen.getByRole('button', { name: 'Use Saved voice' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      voiceRef: identities.voiceOptions[0].voiceRef,
      voiceId: 'voice-1',
    });
  });

  it('keeps avatar and voice on separate tabs and moves to Voice after an avatar is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={onChange}
      />,
    );
    await openPicker(user);
    expect(screen.getByRole('tab', { name: /^Avatar/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Use Saved voice' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saved photo' }));
    expect(onChange).toHaveBeenLastCalledWith({
      avatarRef: undefined,
      avatarPhotoUrl: 'https://assets.test/photo.jpg',
    });
    expect(screen.getByRole('tab', { name: /^Voice/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Use Saved voice' }),
    ).toBeVisible();
  });

  it('previews a voice without selecting it and marks the chosen voice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={{
          ...settings,
          avatarPhotoUrl: 'https://assets.test/photo.jpg',
          voiceId: 'voice-1',
          voiceRef: identities.voiceOptions[0].voiceRef,
        }}
        type="avatar"
        onChange={onChange}
      />,
    );
    await openPicker(user);
    await user.click(screen.getByRole('tab', { name: /^Voice/ }));
    expect(
      screen.getByRole('button', { name: 'Preview Saved voice' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Saved voice selected' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText('Saved photo speaking as Saved voice'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('keeps Done disabled and names what is missing until both are chosen', async () => {
    const user = userEvent.setup();
    const view = render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    await openPicker(user);
    expect(screen.getByText('Pick an avatar and a voice')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    view.rerender(
      <StudioIdentityFields
        settings={{
          ...settings,
          avatarPhotoUrl: 'https://assets.test/photo.jpg',
        }}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Pick a voice')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  describe('voice gender', () => {
    const voiceOption = (name: string, gender: 'female' | 'male' | null) => ({
      label: `${name} (HeyGen · public)`,
      name,
      source: 'HeyGen · public',
      value: `heygen:public:${name}`,
      gender,
      voiceRef: {
        source: 'catalog' as const,
        provider: VoiceProvider.HEYGEN,
        externalVoiceId: name,
        ownership: 'public' as const,
      },
    });
    const avatarOption = (name: string, gender: 'female' | 'male' | null) => ({
      label: `${name} (Photo)`,
      name,
      source: 'Photo',
      value: `https://assets.test/${name}.jpg`,
      gender,
    });

    it('hides voices whose stated gender differs from the avatar', async () => {
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        avatarOptions: [avatarOption('Dante', 'male')],
        voiceOptions: [
          voiceOption('Lucian', 'male'),
          voiceOption('Elowen', 'female'),
          voiceOption('Clone', null),
        ],
      });
      const user = userEvent.setup();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            avatarPhotoUrl: 'https://assets.test/Dante.jpg',
          }}
          type="avatar"
          onChange={vi.fn()}
        />,
      );
      await openPicker(user);
      expect(screen.getByRole('tab', { name: /^Voice/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Use Lucian' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Use Clone' })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Use Elowen' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Only voices that match Dante are shown'),
      ).toBeVisible();
    });

    it('clears a chosen voice that does not match a newly picked avatar', async () => {
      mocks.identities.mockReturnValue({
        ...identities,
        error: null,
        avatarOptions: [avatarOption('Dante', 'male')],
        voiceOptions: [voiceOption('Elowen', 'female')],
      });
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{
            ...settings,
            voiceId: 'Elowen',
            voiceRef: voiceOption('Elowen', 'female').voiceRef,
          }}
          type="avatar"
          onChange={onChange}
        />,
      );
      await openPicker(user);
      await user.click(screen.getByRole('button', { name: 'Dante (Photo)' }));
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        avatarRef: undefined,
        avatarPhotoUrl: 'https://assets.test/Dante.jpg',
        voiceRef: undefined,
        voiceId: undefined,
      });
    });
  });

  it('starts from the brand saved avatar and voice when nothing is chosen', () => {
    const defaultVoiceRef = identities.voiceOptions[0].voiceRef;
    mocks.brand.mockReturnValue({
      selectedBrand: {
        id: 'brand-1',
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://assets.test/photo.jpg',
          defaultVoiceRef,
        },
      },
    });
    const onChange = vi.fn();
    render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      avatarPhotoUrl: 'https://assets.test/photo.jpg',
      voiceRef: defaultVoiceRef,
      voiceId: 'voice-1',
    });
  });

  it('keeps unready native avatars and all identity changes disabled when required', async () => {
    const user = userEvent.setup();
    mocks.identities.mockReturnValue({
      ...identities,
      avatarOptions: [
        {
          label: 'Not ready',
          name: 'Not ready',
          source: 'HeyGen',
          value: 'look',
          disabled: true,
        },
      ],
    });
    const view = render(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
      />,
    );
    await openPicker(user);
    expect(screen.getByRole('button', { name: 'Not ready' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /^Voice/ }));
    view.rerender(
      <StudioIdentityFields
        settings={settings}
        type="avatar"
        onChange={vi.fn()}
        isDisabled
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Use Saved voice' }),
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
    await openPicker(user);
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
        label: `Voice ${index + 1} (ELEVENLABS)`,
        name: `Voice ${index + 1}`,
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
    await openPicker(user);
    expect(
      screen.queryByRole('button', { name: 'Use Voice 13' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More voices' }));
    expect(screen.getByRole('button', { name: 'Use Voice 13' })).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: 'Search voices' }),
      'Voice 25',
    );
    expect(screen.getByRole('button', { name: 'Use Voice 25' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Use Voice 1' }),
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
    await openPicker(user);
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
    await openPicker(user);
    expect(screen.getByRole('button', { name: 'Saved photo' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Retry HeyGen identities' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /^Voice/ }));
    expect(
      screen.getByRole('button', { name: 'Use Saved voice' }),
    ).toBeEnabled();
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
      name: 'Founder clone',
      source: 'HeyGen Voice · private',
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
        screen.getByRole('button', { name: 'Use Founder clone' }),
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

    it('clears an avatar voice id saved without its provider so the user re-picks', () => {
      mocks.identities.mockReturnValue({ ...identities, error: null });
      const onChange = vi.fn();
      render(
        <StudioIdentityFields
          settings={{ ...settings, voiceId: 'voice-1', voiceRef: undefined }}
          type="avatar"
          onChange={onChange}
        />,
      );

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        voiceRef: undefined,
        voiceId: undefined,
      });
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
