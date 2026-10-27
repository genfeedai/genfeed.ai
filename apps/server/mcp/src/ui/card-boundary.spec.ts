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
        createElement(CardBoundary, {
          // biome-ignore lint/correctness/noChildrenProp: CardBoundaryProps.children is required, so the spec typecheck needs it in props
          children: createElement(Broken),
          fallback: 'Our launch video.',
          key: 'bad',
        }),
        createElement(CardBoundary, {
          // biome-ignore lint/correctness/noChildrenProp: CardBoundaryProps.children is required, so the spec typecheck needs it in props
          children: createElement('p', null, 'Draft that renders.'),
          fallback: 'unused',
          key: 'ok',
        }),
      ),
    ),
  );
  expect(container.textContent).toBe('Our launch video.Draft that renders.');
  root.unmount();
  vi.restoreAllMocks();
});
