// @vitest-environment jsdom

import { queryClientWrapper } from '@app-tests/query-client.harness';
import { VoiceProvider } from '@genfeedai/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceStudio from '@/features/voice-studio/voice-studio';

const api = vi.hoisted(() => ({
  brandUpdates: [] as unknown[],
  clones: [] as Record<string, string>[],
  elevenLabs: 'disconnected',
  heyGen: 'connected',
  sample: { durationSeconds: 90, isTooQuiet: false },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback } = await import('react');
  return {
    useAuthedService: (factory: (token: string) => unknown) =>
      useCallback(async () => factory('token'), []),
  };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
    orgHref: (path: string) => `/acme${path}`,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ refreshBrands: async () => undefined }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section>
      <h1>{label}</h1>
      {children}
    </section>
  ),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({
      fetchConnectionStatus: async () => ({
        hasCustomKey: api.heyGen !== 'disconnected',
        isConnected: api.heyGen === 'connected',
        provider: 'heygen',
        state: api.heyGen,
      }),
    }),
  },
}));

vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: () => ({
      findAccountVoices: async () => ({
        connection: { status: api.elevenLabs },
        hasMore: false,
        nextPageToken: null,
        voices: [],
      }),
    }),
  },
}));

vi.mock('@services/ingredients/voice-clone.service', () => ({
  VoiceCloneService: {
    getInstance: () => ({
      cloneVoice: async (form: FormData) => {
        const fields = Object.fromEntries(
          [...form.entries()].map(([key, value]) => [
            key,
            typeof value === 'string' ? value : value.type,
          ]),
        );
        api.clones.push(fields);
        return {
          id: 'voice-1',
          isCloned: true,
          metadataLabel: fields.name,
          provider: fields.provider,
          voiceSource: 'cloned',
        };
      },
    }),
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({
      updateAgentConfig: async (id: string, data: unknown) => {
        api.brandUpdates.push({ data, id });
      },
    }),
  },
}));

vi.mock('@/features/voice-studio/utils/voice-sample-wav', () => ({
  prepareVoiceSample: async () => ({
    ...api.sample,
    file: new File(['wav'], 'voice-sample.wav', { type: 'audio/wav' }),
  }),
}));

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(64)]) });
    this.onstop?.();
  }
}

const getUserMedia = vi.fn(async () => ({
  getTracks: () => [{ stop: () => undefined }],
}));

async function recordTake() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start recording' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
}

describe('VoiceStudio', () => {
  beforeEach(() => {
    api.brandUpdates = [];
    api.clones = [];
    api.elevenLabs = 'disconnected';
    api.heyGen = 'connected';
    api.sample = { durationSeconds: 90, isTooQuiet: false };
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the person’s own account when none is connected', async () => {
    api.heyGen = 'disconnected';
    render(<VoiceStudio />, { wrapper: queryClientWrapper() });

    expect(
      await screen.findByRole('heading', {
        name: 'Connect your HeyGen or ElevenLabs account',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Integrations' }),
    ).toHaveAttribute('href', '/acme/settings/integrations');
  });

  it('records with the browser’s voice processing off', async () => {
    render(<VoiceStudio />, { wrapper: queryClientWrapper() });

    await recordTake();

    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    expect(screen.getByRole('region', { name: 'Read this' })).toHaveTextContent(
      /this is my voice/,
    );
  });

  it('clones the take on HeyGen and makes it the brand’s voice', async () => {
    render(<VoiceStudio />, { wrapper: queryClientWrapper() });

    await recordTake();
    fireEvent.change(screen.getByLabelText('Voice name'), {
      target: { value: 'Studio me' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create my voice' }));
    });

    expect(
      await screen.findByText(
        "Studio me is ready in your HeyGen account and is now this brand's voice.",
      ),
    ).toBeInTheDocument();
    expect(api.clones).toEqual([
      { file: 'audio/wav', name: 'Studio me', provider: VoiceProvider.HEYGEN },
    ]);
    expect(api.brandUpdates).toEqual([
      {
        data: {
          defaultVoiceId: 'voice-1',
          defaultVoiceRef: {
            internalVoiceId: 'voice-1',
            label: 'Studio me',
            provider: VoiceProvider.HEYGEN,
            source: 'cloned',
          },
        },
        id: 'brand-1',
      },
    ]);
  });

  it('lets the person pick ElevenLabs when both accounts are connected', async () => {
    api.elevenLabs = 'connected';
    render(<VoiceStudio />, { wrapper: queryClientWrapper() });

    await recordTake();
    fireEvent.click(screen.getByRole('radio', { name: 'ElevenLabs' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /brand's voice/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create my voice' }));
    });

    expect(
      await screen.findByText('My voice is ready in your ElevenLabs account.'),
    ).toBeInTheDocument();
    expect(api.clones[0]?.provider).toBe(VoiceProvider.ELEVENLABS);
    expect(api.brandUpdates).toEqual([]);
  });

  it.each([
    [{ durationSeconds: 12, isTooQuiet: false }, /shorter than 30 seconds/],
    [{ durationSeconds: 90, isTooQuiet: true }, /could barely hear you/],
  ])('refuses a take before sending it (%#)', async (sample, message) => {
    api.sample = sample;
    render(<VoiceStudio />, { wrapper: queryClientWrapper() });

    await recordTake();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create my voice' }));
    });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(api.clones).toEqual([]);
  });
});
