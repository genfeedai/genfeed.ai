// @vitest-environment jsdom

import { CardBoundary } from '@mcp/ui/card-boundary';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

function Broken(): never {
  throw new Error('render failed');
}

it('shows the card text in place of a card that throws and keeps its siblings', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        'div',
        null,
        createElement(
          CardBoundary,
          { fallback: 'Our launch video.', key: 'bad' },
          createElement(Broken),
        ),
        createElement(
          CardBoundary,
          { fallback: 'unused', key: 'ok' },
          createElement('p', null, 'Draft that renders.'),
        ),
      ),
    ),
  );
  expect(container.textContent).toBe('Our launch video.Draft that renders.');
  root.unmount();
  vi.restoreAllMocks();
});
