import StudioPlaygroundStarterIdeas from '@pages/studio/playground/components/StudioPlaygroundStarterIdeas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

describe('StudioPlaygroundStarterIdeas', () => {
  it('offers one card per content job and fills a plain product photo', () => {
    const onSelect = vi.fn();
    render(<StudioPlaygroundStarterIdeas onSelect={onSelect} />);

    expect(
      screen.getByRole('region', { name: 'Start with an idea' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: 'Use Product photo' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '1:1',
        promptTemplate: 'product-photo',
        openLibraryRole: 'reference',
        type: 'image',
        content: {
          content: [
            {
              content: [
                {
                  text: 'Product photo on a clean studio background, soft shadow, sharp detail.',
                  type: 'text',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
      }),
    );
  });

  it('tags the brand character inside image and video ideas', () => {
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundStarterIdeas
        character={{ handle: 'anna', id: 'char-anna', label: 'Anna' }}
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByText(/Tags Anna/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Use Product ad' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '9:16',
        openLibraryRole: 'startFrame',
        promptTemplate: 'influencer-video',
        type: 'video',
        content: expect.objectContaining({
          content: [
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  attrs: { handle: 'anna', id: 'char-anna', label: 'Anna' },
                  type: 'characterMention',
                }),
              ]),
            }),
          ],
        }),
      }),
    );
  });

  it('attaches the brand product and asks for one when the kit has none', () => {
    const onSelect = vi.fn();
    const product = {
      id: 'bottle-1',
      label: 'Bottle',
      previewUrl: 'https://cdn.example/bottle.png',
    };
    const { rerender } = render(
      <StudioPlaygroundStarterIdeas
        onSelect={onSelect}
        productReference={product}
      />,
    );

    expect(screen.getAllByText(/Uses Bottle/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Use Product photo' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        productReference: { ...product, role: 'reference' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use Product ad' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productReference: { ...product, role: 'startFrame' },
        type: 'video',
      }),
    );

    rerender(
      <StudioPlaygroundStarterIdeas
        onSelect={onSelect}
        productReference={{
          id: 'bottle-1',
          previewUrl: 'https://cdn.example/bottle.png',
        }}
      />,
    );
    expect(screen.getAllByText(/Uses Product/)).toHaveLength(2);

    rerender(<StudioPlaygroundStarterIdeas onSelect={onSelect} />);
    expect(screen.getAllByText(/Add a product image/)).toHaveLength(2);
  });
});
