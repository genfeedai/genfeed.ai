import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { VoiceCloneStatus } from '@genfeedai/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: 'connected',
    getSocketManager: () => ({ isConnected: () => false }),
    isReady: false,
    subscribe: () => () => undefined,
  }),
}));

import { VoiceCloneCard } from '@genfeedai/agent/components/VoiceCloneCard';

interface ApiOverrides {
  cloneVoiceEffect?: ReturnType<typeof vi.fn>;
  getClonedVoicesEffect?: ReturnType<typeof vi.fn>;
  getGeneratedAssetEffect?: ReturnType<typeof vi.fn>;
  generateVoiceEffect?: ReturnType<typeof vi.fn>;
  setBrandVoiceDefaultsEffect?: ReturnType<typeof vi.fn>;
}

function makeApiService(overrides: ApiOverrides = {}): AgentApiService {
  return {
    cloneVoiceEffect: vi.fn(() =>
      Effect.succeed({
        cloneStatus: VoiceCloneStatus.READY,
        id: 'voice-new',
        label: 'New voice',
      }),
    ),
    getClonedVoicesEffect: vi.fn(() => Effect.succeed([])),
    getGeneratedAssetEffect: vi.fn(() =>
      Effect.succeed({ id: 'generated-voice-1', status: 'GENERATED' }),
    ),
    generateVoiceEffect: vi.fn(() =>
      Effect.succeed({ id: 'generated-voice-1', status: 'PROCESSING' }),
    ),
    setBrandVoiceDefaultsEffect: vi.fn(() => Effect.succeed(undefined)),
    ...overrides,
  } as unknown as AgentApiService;
}

function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    audioUrl: 'https://cdn.test/sample.mp3',
    brandId: 'brand-1',
    description: 'Clone your voice for narration',
    existingVoices: [
      { id: 'voice-1', label: 'Morning voice', provider: 'elevenlabs' },
    ],
    id: 'voice-card-1',
    recommendedVoiceId: 'voice-1',
    title: 'Voice setup',
    type: 'voice_clone_card',
    ...overrides,
  } as AgentUiAction;
}

function makeAudioFile(name = 'sample.mp3'): File {
  return new File(['audio-bytes'], name, { type: 'audio/mpeg' });
}

describe('VoiceCloneCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders title, description, and both voice paths', () => {
    render(
      <VoiceCloneCard action={makeAction()} apiService={makeApiService()} />,
    );

    expect(screen.getByText('Voice setup')).toBeInTheDocument();
    expect(
      screen.getByText('Clone your voice for narration'),
    ).toBeInTheDocument();
    expect(screen.getByText('Use existing voice')).toBeInTheDocument();
    expect(screen.getByText('Drop audio file here')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clone new voice/i }),
    ).toBeDisabled();
  });

  it('uses the recommended existing voice as brand default', async () => {
    const setBrandVoiceDefaultsEffect = vi.fn(() => Effect.succeed(undefined));
    render(
      <VoiceCloneCard
        action={makeAction()}
        apiService={makeApiService({ setBrandVoiceDefaultsEffect })}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });

    expect(setBrandVoiceDefaultsEffect).toHaveBeenCalledWith('brand-1', {
      defaultVoiceId: 'voice-1',
    });
    await waitFor(() =>
      expect(screen.queryByText('Voice setup')).not.toBeInTheDocument(),
    );
  });

  it('generates requested speech from the selected voice instead of only saving a default', async () => {
    const generateVoiceEffect = vi.fn(() =>
      Effect.succeed({ id: 'generated-voice-1', status: 'PROCESSING' }),
    );
    render(
      <VoiceCloneCard
        action={makeAction({
          title: 'Generate Voice',
          voiceoverText: 'Welcome to FUD News',
        })}
        apiService={makeApiService({ generateVoiceEffect })}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });

    expect(generateVoiceEffect).toHaveBeenCalledWith({
      sourceActionId: 'voice-card-1',
      text: 'Welcome to FUD News',
      voiceId: 'voice-1',
      waitForCompletion: false,
    });
  });

  it('stops voice generation reconciliation after repeated API failures', async () => {
    vi.useFakeTimers();
    const getGeneratedAssetEffect = vi.fn(() =>
      Effect.fail(new Error('network unavailable')),
    );
    render(
      <VoiceCloneCard
        action={makeAction({
          title: 'Generate Voice',
          voiceoverText: 'Welcome to FUD News',
        })}
        apiService={makeApiService({ getGeneratedAssetEffect })}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });

    expect(getGeneratedAssetEffect).toHaveBeenCalledTimes(10);
    expect(
      screen.getByText(
        'Unable to reconcile voice generation. Please try again.',
      ),
    ).toBeInTheDocument();
  });

  it('bounds voice reconciliation when the asset remains processing', async () => {
    vi.useFakeTimers();
    const getGeneratedAssetEffect = vi.fn(() =>
      Effect.succeed({ id: 'generated-voice-1', status: 'PROCESSING' }),
    );
    render(
      <VoiceCloneCard
        action={makeAction({
          title: 'Generate Voice',
          voiceoverText: 'Welcome to FUD News',
        })}
        apiService={makeApiService({ getGeneratedAssetEffect })}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    });

    expect(getGeneratedAssetEffect).toHaveBeenCalledTimes(360);
    expect(
      screen.getByText(
        'Voice generation is taking longer than expected. Please try again.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an error when no brand is active', async () => {
    render(
      <VoiceCloneCard
        action={makeAction({ brandId: undefined })}
        apiService={makeApiService()}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });

    expect(screen.getByText(/no active brand found/i)).toBeInTheDocument();
  });

  it('surfaces API failures when setting the default voice', async () => {
    const setBrandVoiceDefaultsEffect = vi.fn(() =>
      Effect.fail(new Error('config rejected')),
    );
    render(
      <VoiceCloneCard
        action={makeAction()}
        apiService={makeApiService({ setBrandVoiceDefaultsEffect })}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /use selected voice/i }),
      );
    });

    expect(screen.getByText('config rejected')).toBeInTheDocument();
  });

  it('accepts a dropped audio file and clones it to done', async () => {
    const cloneVoiceEffect = vi.fn(() =>
      Effect.succeed({
        cloneStatus: VoiceCloneStatus.READY,
        id: 'voice-new',
        label: 'New voice',
      }),
    );
    const setBrandVoiceDefaultsEffect = vi.fn(() => Effect.succeed(undefined));
    render(
      <VoiceCloneCard
        action={makeAction()}
        apiService={makeApiService({
          cloneVoiceEffect,
          setBrandVoiceDefaultsEffect,
        })}
      />,
    );

    const dropzone = screen.getByText('Drop audio file here').closest('button');
    if (!dropzone) {
      throw new Error('Dropzone button not found');
    }
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeAudioFile()] },
    });

    expect(screen.getByText('sample.mp3')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clone new voice/i }));
    });

    expect(cloneVoiceEffect).toHaveBeenCalled();
    expect(setBrandVoiceDefaultsEffect).toHaveBeenCalledWith('brand-1', {
      defaultVoiceId: 'voice-new',
    });
    await waitFor(() =>
      expect(screen.queryByText('Voice setup')).not.toBeInTheDocument(),
    );
  });

  it('enters the cloning state when the clone is still processing', async () => {
    const cloneVoiceEffect = vi.fn(() =>
      Effect.succeed({
        cloneStatus: VoiceCloneStatus.CLONING,
        id: 'voice-new',
        label: 'New voice',
      }),
    );
    render(
      <VoiceCloneCard
        action={makeAction({ brandId: undefined })}
        apiService={makeApiService({ cloneVoiceEffect })}
      />,
    );

    const dropzone = screen.getByText('Drop audio file here').closest('button');
    if (!dropzone) {
      throw new Error('Dropzone button not found');
    }
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeAudioFile()] },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clone new voice/i }));
    });

    // Cloning keeps the card visible with a disabled clone button.
    expect(screen.getByText('Voice setup')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clone new voice/i }),
    ).toBeDisabled();
  });

  it('rejects non-audio drops with an inline error', () => {
    render(
      <VoiceCloneCard action={makeAction()} apiService={makeApiService()} />,
    );

    const dropzone = screen.getByText('Drop audio file here').closest('button');
    if (!dropzone) {
      throw new Error('Dropzone button not found');
    }
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [new File(['nope'], 'doc.pdf', { type: 'application/pdf' })],
      },
    });

    expect(screen.getByText('Please drop an audio file')).toBeInTheDocument();
  });

  it('shows a clone failure message when the API rejects', async () => {
    const cloneVoiceEffect = vi.fn(() =>
      Effect.fail(new Error('quota exceeded')),
    );
    render(
      <VoiceCloneCard
        action={makeAction()}
        apiService={makeApiService({ cloneVoiceEffect })}
      />,
    );

    const dropzone = screen.getByText('Drop audio file here').closest('button');
    if (!dropzone) {
      throw new Error('Dropzone button not found');
    }
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeAudioFile()] },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clone new voice/i }));
    });

    expect(screen.getByText('quota exceeded')).toBeInTheDocument();
  });

  it('selects a file through the hidden input', () => {
    const { container } = render(
      <VoiceCloneCard action={makeAction()} apiService={makeApiService()} />,
    );

    const input = container.querySelector('input[type="file"]');
    if (!input) {
      throw new Error('File input not found');
    }
    fireEvent.change(input, {
      target: { files: [makeAudioFile('take2.wav')] },
    });

    expect(screen.getByText('take2.wav')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clone new voice/i }),
    ).toBeEnabled();
  });
});
