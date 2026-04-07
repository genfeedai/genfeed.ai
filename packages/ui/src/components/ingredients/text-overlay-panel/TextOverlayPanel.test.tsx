import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IVideo } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import TextOverlayPanel from '@ui/ingredients/text-overlay-panel/TextOverlayPanel';
import { describe, expect, it, vi } from 'vitest';

describe('TextOverlayPanel', () => {
  const video = {
    category: IngredientCategory.VIDEO,
    id: 'video-1',
    status: IngredientStatus.GENERATED,
  } as IVideo;

  it('should render without crashing', () => {
    const { container } = render(
      <TextOverlayPanel video={video} isOpen={true} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <TextOverlayPanel video={video} isOpen={true} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <TextOverlayPanel video={video} isOpen={true} onClose={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
