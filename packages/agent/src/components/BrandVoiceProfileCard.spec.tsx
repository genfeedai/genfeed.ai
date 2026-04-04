import { BrandVoiceProfileCard } from '@genfeedai/agent/components/BrandVoiceProfileCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('BrandVoiceProfileCard', () => {
  it('renders the structured brand voice fields', () => {
    const action: AgentUiAction = {
      data: {
        voiceProfile: {
          audience: ['founders', 'operators'],
          doNotSoundLike: ['corporate jargon'],
          messagingPillars: ['clarity', 'systems'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'direct',
          tone: 'confident',
          values: ['clarity', 'proof'],
        },
      },
      id: 'brand-voice-1',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };

    render(<BrandVoiceProfileCard action={action} />);

    expect(screen.getByText('confident')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
    expect(screen.getByText('founders, operators')).toBeInTheDocument();
    expect(screen.getByText('clarity, systems')).toBeInTheDocument();
    expect(
      screen.getByText('Clear systems create compounding output.'),
    ).toBeInTheDocument();
  });

  it('executes the approval CTA through the UI action handler', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      ctas: [
        {
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
          payload: {
            brandId: 'brand-1',
            voiceProfile: { tone: 'confident' },
          },
        },
      ],
      data: {
        voiceProfile: {
          tone: 'confident',
        },
      },
      id: 'brand-voice-2',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };

    render(<BrandVoiceProfileCard action={action} onUiAction={onUiAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));

    expect(onUiAction).toHaveBeenCalledWith(
      'confirm_save_brand_voice_profile',
      {
        brandId: 'brand-1',
        voiceProfile: { tone: 'confident' },
      },
    );
  });
});
