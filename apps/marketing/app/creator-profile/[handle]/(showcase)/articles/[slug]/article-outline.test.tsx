import type { ArticleSection } from '@props/content/public-article.props';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleOutline from './article-outline';

const SECTIONS: ArticleSection[] = [
  { id: 'build-the-cast', label: 'Build the cast', level: 2 },
  { id: 'pick-a-voice', label: 'Pick a voice', level: 3 },
  { id: 'ship-it', label: 'Ship it', level: 2 },
];

type ObserverCallback = (
  entries: Array<Partial<IntersectionObserverEntry>>,
) => void;

let notify: ObserverCallback = () => undefined;

/** Puts the named headings in or out of the reading band. */
function scrollTo(inBand: string[], outOfBand: string[] = []): void {
  act(() => {
    notify([
      ...inBand.map((id) => ({
        isIntersecting: true,
        target: document.getElementById(id) as Element,
      })),
      ...outOfBand.map((id) => ({
        isIntersecting: false,
        target: document.getElementById(id) as Element,
      })),
    ]);
  });
}

function renderWithHeadings(): void {
  for (const section of SECTIONS) {
    const heading = document.createElement('h2');
    heading.id = section.id;
    document.body.append(heading);
  }
  render(<ArticleOutline sections={SECTIONS} />);
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        notify = callback;
      }
      disconnect(): void {}
      observe(): void {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('ArticleOutline', () => {
  it('links every section', () => {
    renderWithHeadings();

    expect(screen.getByRole('link', { name: 'Ship it' })).toHaveAttribute(
      'href',
      '#ship-it',
    );
  });

  it('marks the section being read', () => {
    renderWithHeadings();

    scrollTo(['pick-a-voice']);

    expect(screen.getByRole('link', { name: 'Pick a voice' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(
      screen.getByRole('link', { name: 'Build the cast' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks the first of two sections that share the screen', () => {
    renderWithHeadings();

    scrollTo(['ship-it', 'build-the-cast']);

    expect(
      screen.getByRole('link', { name: 'Build the cast' }),
    ).toHaveAttribute('aria-current', 'location');
  });

  it('keeps the last section while the reader is between headings', () => {
    renderWithHeadings();

    scrollTo(['ship-it']);
    scrollTo([], ['ship-it']);

    expect(screen.getByRole('link', { name: 'Ship it' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('renders nothing for an article without headings', () => {
    const { container } = render(<ArticleOutline sections={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
