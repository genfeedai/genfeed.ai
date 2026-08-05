import { AgentTextArtifactPreview } from '@genfeedai/agent/components/AgentTextArtifactPreview';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

describe('AgentTextArtifactPreview', () => {
  it('uses the canonical X platform renderer for a Twitter output', () => {
    render(
      <AgentTextArtifactPreview
        data={{
          content: 'A concise launch post.',
          contentFormat: 'social_post',
          platform: 'twitter',
          title: 'Launch post',
        }}
      />,
    );

    expect(
      screen.getByRole('article', { name: 'X (Twitter) platform preview' }),
    ).toBeInTheDocument();
  });

  it('opens a newsletter reader preview in a dialog', () => {
    render(
      <AgentTextArtifactPreview
        data={{
          content: '## This week\n\nThe important update.',
          contentFormat: 'newsletter',
          preheader: 'A short weekly briefing',
          subject: 'The founder briefing',
          title: 'Newsletter draft',
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand newsletter preview' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('The founder briefing')).toHaveLength(2);
    expect(screen.getAllByText('A short weekly briefing')).toHaveLength(2);
  });
});
