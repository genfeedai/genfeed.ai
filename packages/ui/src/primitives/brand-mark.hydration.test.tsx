import { act } from '@testing-library/react';
import Spinner from '@ui/primitives/spinner';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Dark Reader (and its API engine) inserts a `<style class="darkreader
 * darkreader--sync">` right after every `<style>` it manages, including SVG
 * `<style>` elements, before React hydrates. A `<style>` rendered in place by
 * a server-rendered component therefore gains a sibling React never rendered.
 */
function insertDarkReaderSyncStyles(root: ParentNode): number {
  const managed = Array.from(root.querySelectorAll('style')).filter(
    (style) => !style.classList.contains('darkreader'),
  );

  for (const style of managed) {
    const sync = document.createElement('style');
    sync.className = 'darkreader darkreader--sync';
    sync.media = 'screen';
    style.parentNode?.insertBefore(sync, style.nextSibling);
  }

  return managed.length;
}

describe('BrandMark hydration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('hydrates the protected-shell spinner when a browser extension adds style siblings', async () => {
    const tree = <Spinner aria-hidden="true" className="size-6" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);

    insertDarkReaderSyncStyles(document);

    const onRecoverableError = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('svg style')).toBeNull();
    expect(container.querySelector('.genfeed-loader-fill')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
