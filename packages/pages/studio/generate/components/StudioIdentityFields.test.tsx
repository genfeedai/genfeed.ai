import { RouterPriority, VoiceProvider } from '@genfeedai/contracts';
import StudioIdentityFields from '@pages/studio/generate/components/StudioIdentityFields';
import type { UseStudioGenerateIdentitiesReturn } from '@pages/studio/generate/hooks/useStudioGenerateIdentities';
import type { StudioGenerateSettings } from '@pages/studio/generate/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ identities: vi.fn() }));
vi.mock('@pages/studio/generate/hooks/useStudioGenerateIdentities', () => ({
  useStudioGenerateIdentities: () => mocks.identities(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const settings: StudioGenerateSettings = {
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
const identities: UseStudioGenerateIdentitiesReturn = {
  avatarOptions: [
    { label: 'Saved photo', value: 'https://assets.test/photo.jpg' },
  ],
  error:
    'HeyGen identities could not be loaded. Check your connection in Integrations.',
  isLoadingIdentities: false,
  voiceOptions: [
    {
      label: 'Saved voice (ELEVENLABS)',
      value: 'ELEVENLABS:voice-1',
      voiceRef: {
        source: 'catalog',
        provider: VoiceProvider.ELEVENLABS,
        externalVoiceId: 'voice-1',
      },
    },
  ],
};

describe('Studio identity catalog recovery', () => {
  beforeEach(() => mocks.identities.mockReturnValue(identities));

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
    expect(screen.getByRole('combobox', { name: 'Avatar' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Voice' })).toBeEnabled();
    await user.click(screen.getByRole('combobox', { name: 'Voice' }));
    await user.click(
      screen.getByRole('option', { name: 'Saved voice (ELEVENLABS)' }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      voiceRef: identities.voiceOptions[0].voiceRef,
      voiceId: 'voice-1',
    });
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
});
