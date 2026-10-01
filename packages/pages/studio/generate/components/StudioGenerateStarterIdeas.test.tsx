import StudioGenerateStarterIdeas from '@pages/studio/generate/components/StudioGenerateStarterIdeas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

describe('StudioGenerateStarterIdeas', () => {
  it('offers one card per content job and fills a plain product photo', () => {
    const onSelect = vi.fn();
    render(<StudioGenerateStarterIdeas onSelect={onSelect} />);

    expect(
      screen.getByRole('region', { name: 'Start with an idea' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: 'Use Product photo' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '1:1',
        promptTemplate: 'product-photo',
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
      <StudioGenerateStarterIdeas
        character={{ handle: 'anna', id: 'char-anna', label: 'Anna' }}
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByText(/Tags Anna/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Use Product ad' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '9:16',
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
});
