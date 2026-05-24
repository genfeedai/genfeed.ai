/**
 * Browser smoke test for xterm Terminal.
 *
 * Verifies that the vitest-browser-react + Playwright harness can:
 *  1. Mount a container div and open an @xterm/xterm Terminal on it
 *  2. Confirm xterm scaffolds its DOM structure in a real browser context
 *  3. Confirm that terminal.write() output is reflected in the DOM
 *
 * xterm uses a DOM renderer in headless Chromium (no GPU/WebGL). Canvas
 * elements only appear with a GPU-accelerated renderer. The smoke test
 * therefore targets the always-present xterm DOM structure instead.
 *
 * This test is intentionally minimal — it proves the harness, not the full
 * AgentCliTerminal component (the parallel Wave-2 agent owns that file).
 * Richer component-level tests land once Wave-2 is merged.
 */

import { Terminal } from '@xterm/xterm';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

describe('xterm browser harness smoke test', () => {
  const terminals: Terminal[] = [];

  afterEach(() => {
    for (const t of terminals) {
      t.dispose();
    }
    terminals.length = 0;
  });

  it('opens a terminal and scaffolds xterm DOM nodes', async () => {
    // render() is async in vitest-browser-react
    const { container } = await render(
      <div id="xterm-host" style={{ width: '800px', height: '400px' }} />,
    );

    const terminal = new Terminal({ cols: 80, rows: 24 });
    terminals.push(terminal);

    // container is the RTL wrapper; query the rendered host div inside it
    const host = container.querySelector('#xterm-host') as HTMLElement;
    expect(host).not.toBeNull();

    terminal.open(host);

    // xterm always creates .xterm (wrapper) and .xterm-screen (viewport) nodes,
    // regardless of renderer (DOM vs canvas/WebGL).
    const xtermWrapper = host.querySelector('.xterm');
    expect(xtermWrapper).not.toBeNull();

    const xtermScreen = host.querySelector('.xterm-screen');
    expect(xtermScreen).not.toBeNull();

    // .xterm-rows is the cell row container — always present in DOM mode
    const rows = host.querySelector('.xterm-rows');
    expect(rows).not.toBeNull();
  });

  it('writes text and the xterm rows DOM reflects the content', async () => {
    const { container } = await render(
      <div id="xterm-host-2" style={{ width: '800px', height: '400px' }} />,
    );

    const terminal = new Terminal({ cols: 80, rows: 24 });
    terminals.push(terminal);

    const host = container.querySelector('#xterm-host-2') as HTMLElement;
    expect(host).not.toBeNull();

    terminal.open(host);

    // Write a known string to the terminal buffer and await the flush callback
    await new Promise<void>((resolve) => {
      terminal.write('hello xterm\r\n', resolve);
    });

    // Give the DOM renderer a tick to flush row updates (rAF-based in xterm)
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const rows = host.querySelector('.xterm-rows');
    expect(rows).not.toBeNull();

    // xterm renders each character into <span> elements inside row <div>s.
    // The aggregate textContent of all rows should contain the written string.
    expect(rows?.textContent).toContain('hello xterm');
  });
});
