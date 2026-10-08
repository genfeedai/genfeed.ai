import type { PublicModelCatalogItem } from '@public/models/models-loader';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiModelSelectorContent from './ai-model-selector-content';

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const models: PublicModelCatalogItem[] = [
  {
    aspectRatios: ['9:16'],
    capabilities: [],
    category: 'image',
    costTier: 'low',
    durations: [],
    id: 'portrait',
    isDefault: true,
    isHighlighted: false,
    key: 'portrait-model',
    label: 'Portrait Model',
    provider: 'Example',
    recommendedFor: [],
    supportsFeatures: [],
  },
  {
    aspectRatios: ['16:9'],
    capabilities: [],
    category: 'video',
    durations: [5],
    id: 'video',
    isDefault: true,
    isHighlighted: false,
    key: 'video-model',
    label: 'Video Model',
    provider: 'Example',
    recommendedFor: [],
    supportsFeatures: [],
  },
];

afterEach(() => vi.unstubAllGlobals());

describe('free AI model selector', () => {
  it('shows a result before interaction, updates by format, and has one product CTA', () => {
    render(<AiModelSelectorContent models={models} />);
    expect(
      screen.getByRole('heading', { name: 'Portrait Model' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Landscape' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /Create content in Genfeed/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('heading', { name: 'Video Model' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Portrait Model' }),
    ).not.toBeInTheDocument();
  });
  it('explains a non-match and restores the initial result when filters reset', () => {
    render(<AiModelSelectorContent models={models} />);
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Landscape' }));
    expect(
      screen.getByRole('heading', { name: 'No models match these choices.' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    fireEvent.change(
      screen.getByLabelText('Find a model or provider (optional)'),
      { target: { value: 'missing' } },
    );
    expect(
      screen.queryByRole('button', { name: 'Copy shortlist' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(
      screen.getByRole('heading', { name: 'Portrait Model' }),
    ).toBeInTheDocument();
  });
  it('shows sourced examples only for the exact model, and survives a broken image', () => {
    const sampleModel = { ...models[0], key: 'google/nano-banana-2-lite' };
    render(<AiModelSelectorContent models={[sampleModel]} />);
    const image = screen.getByRole('img', {
      name: /Nano Banana 2 Lite provider example/,
    });
    expect(image).toHaveAttribute(
      'src',
      expect.stringContaining('replicate.delivery'),
    );
    expect(
      screen.getByRole('link', { name: /Replicate example/ }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('replicate.com/google/nano-banana-2-lite'),
    );
    fireEvent.error(image);
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Portrait Model' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Benchmark unavailable')).toBeInTheDocument();
  });
  it('distinguishes a catalog outage from an empty catalog', () => {
    const { rerender } = render(<AiModelSelectorContent models={null} />);
    expect(
      screen.getByText('The model catalog could not be reached.'),
    ).toBeInTheDocument();
    rerender(<AiModelSelectorContent models={[]} />);
    expect(
      screen.getByText('No models are currently listed.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy shortlist' }),
    ).not.toBeInTheDocument();
  });
  it('copies only the current shortlist and handles a clipboard failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<AiModelSelectorContent models={models} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy shortlist' }));
    await waitFor(() =>
      expect(screen.getByText('Shortlist copied.')).toBeInTheDocument(),
    );
    expect(writeText.mock.calls[0][0]).toContain('Portrait Model');
    expect(writeText.mock.calls[0][0]).not.toContain('Video Model');
    writeText.mockRejectedValue(new Error('Denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy shortlist' }));
    await waitFor(() =>
      expect(screen.getByText(/Could not copy/)).toBeInTheDocument(),
    );
  });
});
