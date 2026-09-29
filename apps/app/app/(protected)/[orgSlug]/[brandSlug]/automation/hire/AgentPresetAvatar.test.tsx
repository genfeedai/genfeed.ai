import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AgentPresetAvatar from './AgentPresetAvatar';

function faceOf(presetId: string): Element {
  const face = screen
    .getByTestId(`agent-avatar-${presetId}`)
    .querySelector('svg');
  if (!face) {
    throw new Error('avatar face is missing');
  }
  return face;
}

describe('AgentPresetAvatar', () => {
  it('takes the brand color of a single-platform agent', () => {
    render(
      <AgentPresetAvatar
        platforms={['youtube']}
        presetId="youtube-scriptwriter"
        type="youtube_script"
      />,
    );

    expect(faceOf('youtube-scriptwriter')).toHaveClass('bg-red-500');
  });

  it('normalizes platform casing and aliases', () => {
    render(
      <AgentPresetAvatar
        platforms={['LinkedIn', 'linkedin']}
        presetId="linkedin-copywriter"
        type="linkedin_content"
      />,
    );

    expect(faceOf('linkedin-copywriter')).toHaveClass('bg-blue-700');
  });

  it('keeps a multi-platform agent neutral', () => {
    render(
      <AgentPresetAvatar
        platforms={['instagram', 'tiktok', 'youtube']}
        presetId="ads-script-writer"
        type="ads_script_writer"
      />,
    );

    expect(faceOf('ads-script-writer')).toHaveClass('bg-foreground');
  });

  it('keeps an unknown platform neutral', () => {
    render(
      <AgentPresetAvatar
        platforms={['mastodon']}
        presetId="custom-agent"
        type="general"
      />,
    );

    expect(faceOf('custom-agent')).toHaveClass('bg-foreground');
  });

  it('gives the same preset the same eyes every render', () => {
    const { container, rerender } = render(
      <AgentPresetAvatar
        platforms={[]}
        presetId="script-writer"
        type="general"
      />,
    );
    const first = container.querySelector('svg')?.innerHTML;

    rerender(
      <AgentPresetAvatar
        platforms={[]}
        presetId="script-writer"
        type="general"
      />,
    );

    expect(container.querySelector('svg')?.innerHTML).toBe(first);
  });
});
