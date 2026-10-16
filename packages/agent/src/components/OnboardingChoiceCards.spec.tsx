import { OnboardingChoiceCards } from '@genfeedai/agent/components/OnboardingChoiceCards';
import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

function makeRequest(
  overrides: Partial<AgentInputRequest> = {},
): AgentInputRequest {
  return {
    allowFreeText: true,
    inputRequestId: 'url-request',
    options: [
      { id: 'https://genfeed.ai', label: 'Use Genfeed.Ai' },
      { id: 'skip', label: 'Skip' },
    ],
    prompt: 'Share a public link about your brand.',
    threadId: 'thread-1',
    title: 'Your brand link',
    ...overrides,
  };
}

describe('OnboardingChoiceCards', () => {
  it('renders choice cards and leaves free text to the prompt bar', () => {
    render(
      <OnboardingChoiceCards
        hiddenOptionIds={['skip']}
        onSubmit={vi.fn()}
        request={makeRequest()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Your brand link' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Share a public link about your brand.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Genfeed.Ai' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.queryByText('Choose one')).toBeNull();
    expect(screen.queryByText('Other')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit answers' })).toBeNull();
  });

  it('submits a single choice from its card', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <OnboardingChoiceCards onSubmit={onSubmit} request={makeRequest()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use Genfeed.Ai' }));
    expect(onSubmit).toHaveBeenCalledWith('Use Genfeed.Ai', [
      'https://genfeed.ai',
    ]);
  });

  it('keeps a multi-select open until continue', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <OnboardingChoiceCards
        onSubmit={onSubmit}
        request={makeRequest({
          allowFreeText: false,
          isMultiSelect: true,
          options: [
            { id: 'grow_audience', label: 'Grow audience' },
            { id: 'drive_sales', label: 'Drive sales' },
          ],
          title: 'Goal',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grow audience' }));
    fireEvent.click(screen.getByRole('button', { name: 'Drive sales' }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledWith('Grow audience, Drive sales', [
      'grow_audience',
      'drive_sales',
    ]);
  });
});
