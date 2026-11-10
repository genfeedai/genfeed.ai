import type { staticSurfaceClassNames } from '@genfeedai/ui/static/surface';

/**
 * A `<pre><code></code></pre>` command/prompt block paired with its own copy
 * button. Every setup tab uses this so the picker script below only has to
 * know a handful of element ids, not one bespoke markup shape per client.
 * `multiline` swaps in the scrollable `prompt-block` treatment for the two
 * blocks long enough to need it (the chat prompt and the shell-agent
 * prompt); single-line commands render as a plain code block.
 */
export function renderCommandBlock(params: {
  id: string;
  label: string;
  multiline?: boolean;
  textSafe: string;
  ui: typeof staticSurfaceClassNames;
}): string {
  const { id, label, multiline, textSafe, ui } = params;
  const preClass = multiline
    ? `${ui.codeBlock} command prompt-block`
    : `${ui.codeBlock} command`;
  return `<div class="code-row">
          <pre class="${preClass}"><code id="${id}">${textSafe}</code></pre>
          <button class="${ui.buttonSecondary} copy" type="button" data-copy-source="${id}" aria-label="${label}">Copy</button>
        </div>`;
}
