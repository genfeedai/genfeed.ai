import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const ITEMS: readonly ContentMentionItem[] = [
  {
    contentTitle: 'Launch thread',
    contentType: 'text',
    id: 'post-1',
  },
  {
    contentTitle: 'Campaign visual',
    contentType: 'image',
    id: 'post-2',
    thumbnailUrl: 'https://cdn.test/thumb.png',
  },
];

describe('ContentLibraryPicker', () => {
  it('renders the library items as selectable options', () => {
    render(
      <ContentLibraryPicker
        isOpen
        items={ITEMS}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('option', { name: 'Reference Launch thread' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Reference Campaign visual' }),
    ).toBeInTheDocument();
  });

  // Regression: when the mentions fetch fails (or resolves with a non-array
  // body), the picker must fall back to its empty state instead of throwing
  // `Cannot read properties of undefined (reading 'length')` — that render
  // crash tripped the route error boundary and blanked /automation/*.
  it('renders the empty state when items is undefined at runtime', () => {
    render(
      <ContentLibraryPicker
        isOpen
        items={undefined}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText('No library content available yet.'),
    ).toBeInTheDocument();
  });

  it('renders the empty state when the items prop is omitted', () => {
    render(
      <ContentLibraryPicker isOpen onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(
      screen.getByText('No library content available yet.'),
    ).toBeInTheDocument();
  });
});
