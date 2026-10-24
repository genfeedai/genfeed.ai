import { createShadowHost } from '~platforms/ui/tokens';

const ICON_BUTTON_CSS = `
  :host { all: initial; display: inline-flex; flex: none; }
  button {
    box-sizing: border-box; display: inline-grid; place-items: center;
    width: 36px; height: 36px; margin: 0; padding: 0; border: 0;
    border-radius: 50%; background: transparent; color: var(--muted);
    cursor: pointer; transition: background-color 0.15s, color 0.15s;
  }
  button:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button svg { display: block; width: 20px; height: 20px; }
  button[data-spinning] svg { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { button[data-spinning] svg { animation: none; } }
`;

/** A round icon button in a shadow root, for the row of icons under a post. */
export function createIconButton(options: { icon: string; label: string }): {
  button: HTMLButtonElement;
  host: HTMLDivElement;
  setIcon: (markup: string, isSpinning?: boolean) => void;
} {
  const { host, root } = createShadowHost({ css: ICON_BUTTON_CSS });
  const button = document.createElement('button');
  button.type = 'button';
  button.title = options.label;
  button.setAttribute('aria-label', options.label);
  button.innerHTML = options.icon;
  root.appendChild(button);

  const setIcon = (markup: string, isSpinning = false): void => {
    button.innerHTML = markup;
    if (isSpinning) {
      button.dataset.spinning = '';
    } else {
      delete button.dataset.spinning;
    }
  };
  return { button, host, setIcon };
}
