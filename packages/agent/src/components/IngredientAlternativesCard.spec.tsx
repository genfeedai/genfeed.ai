import { IngredientAlternativesCard } from '@genfeedai/agent/components/IngredientAlternativesCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

interface ApiOverrides {
  createPrompt?: ReturnType<typeof vi.fn>;
  generateIngredient?: ReturnType<typeof vi.fn>;
}

function makeApiService(overrides: ApiOverrides = {}): AgentApiService {
  return {
    baseUrl: 'http://api.test',
    createPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
    generateIngredient: vi.fn().mockResolvedValue({
      id: 'gen-1',
      status: 'completed',
      url: 'https://cdn.test/gen-1.png',
    }),
    ...overrides,
  } as unknown as AgentApiService;
}

function makeAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    alternatives: [
      {
        generationType: 'image',
        label: 'Bold colors',
        prompt: 'A bold colorful poster',
      },
      {
        generationType: 'video',
        label: 'Motion teaser',
        prompt: 'A short teaser video',
      },
    ],
    id: 'alts-1',
    title: 'Try an alternative',
    type: 'ingredient_alternatives_card',
    ...overrides,
  } as AgentUiAction;
}

describe('IngredientAlternativesCard', () => {
  it('renders the alternatives with labels and prompts', () => {
    render(
      <IngredientAlternativesCard
        action={makeAction()}
        apiService={makeApiService()}
      />,
    );

    expect(screen.getByText('Try an alternative')).toBeInTheDocument();
    expect(screen.getByText('Bold colors')).toBeInTheDocument();
    expect(screen.getByText('A short teaser video')).toBeInTheDocument();
  });

  it('generates an image for the selected alternative', async () => {
    const createPrompt = vi.fn().mockResolvedValue({ id: 'prompt-1' });
    const generateIngredient = vi.fn().mockResolvedValue({
      id: 'gen-1',
      status: 'completed',
      url: 'https://cdn.test/gen-1.png',
    });
    render(
      <IngredientAlternativesCard
        action={makeAction()}
        apiService={makeApiService({
          createPrompt,
          generateIngredient,
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Bold colors'));
    });

    expect(createPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        isSkipEnhancement: true,
        original: 'A bold colorful poster',
      }),
      expect.any(AbortSignal),
    );
    expect(generateIngredient).toHaveBeenCalledWith(
      'image',
      expect.any(Object),
      expect.any(AbortSignal),
    );

    await waitFor(() =>
      expect(screen.getByAltText('Generated result')).toHaveAttribute(
        'src',
        'https://cdn.test/gen-1.png',
      ),
    );
    expect(screen.getByText('Open in Library')).toHaveAttribute(
      'href',
      '/images/gen-1',
    );
  });

  it('falls back to the API media URL when the result has no url', async () => {
    const generateIngredient = vi
      .fn()
      .mockResolvedValue({ id: 'gen-2', status: 'completed', url: '' });
    render(
      <IngredientAlternativesCard
        action={makeAction()}
        apiService={makeApiService({ generateIngredient })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Motion teaser'));
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Generated result')).toHaveAttribute(
        'src',
        'http://api.test/videos/gen-2',
      ),
    );
    expect(screen.getByText('Open in Library')).toHaveAttribute(
      'href',
      '/videos/gen-2',
    );
  });

  it('shows the error state with retry when generation fails', async () => {
    const generateIngredient = vi
      .fn()
      .mockRejectedValue(new Error('generation blew up'));
    render(
      <IngredientAlternativesCard
        action={makeAction()}
        apiService={makeApiService({ generateIngredient })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Bold colors'));
    });

    await waitFor(() =>
      expect(screen.getByText(/generation blew up/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.queryByText(/generation blew up/i)).not.toBeInTheDocument();
  });

  it('Try Another resets back to the idle grid', async () => {
    render(
      <IngredientAlternativesCard
        action={makeAction()}
        apiService={makeApiService()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Bold colors'));
    });
    await waitFor(() =>
      expect(screen.getByText('Open in Library')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /try another/i }));
    expect(screen.queryByText('Open in Library')).not.toBeInTheDocument();
  });

  it('renders nothing extra with an empty alternatives list', () => {
    render(
      <IngredientAlternativesCard
        action={makeAction({ alternatives: [] })}
        apiService={makeApiService()}
      />,
    );

    expect(screen.getByText('Try an alternative')).toBeInTheDocument();
    expect(screen.queryByText('Open in Library')).not.toBeInTheDocument();
  });
});
