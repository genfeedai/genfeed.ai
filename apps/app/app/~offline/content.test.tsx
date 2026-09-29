import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OfflineContent from './content';

describe('OfflineContent', () => {
  it('uses the themed full-viewport application shell', () => {
    const { container } = render(<OfflineContent />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass(
      'min-h-dvh',
      'w-full',
      'bg-background',
      'text-foreground',
    );
    expect(rootElement).not.toHaveClass('bg-black');
  });
});
