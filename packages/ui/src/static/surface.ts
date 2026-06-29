import { semanticColorTokens } from '../core/colors';
import { radiusTokens } from '../core/radius';

const darkColors = semanticColorTokens.dark;

export const staticSurfaceClassNames = {
  badge: 'gf-badge',
  button: 'gf-button',
  buttonPrimary: 'gf-button gf-button-primary',
  buttonSecondary: 'gf-button gf-button-secondary',
  card: 'gf-card',
  chip: 'gf-chip',
  codeBlock: 'gf-code-block',
  inlineCode: 'gf-inline-code',
  root: 'gf-ui',
  warningNote: 'gf-warning-note',
} as const;

export const staticSurfaceCss = `
.gf-ui {
  --gf-bg-primary: ${darkColors.background.hex};
  --gf-bg-secondary: ${darkColors.card.hex};
  --gf-bg-tertiary: ${darkColors.backgroundSecondary.hex};
  --gf-bg-elevated: ${darkColors.popover.hex};
  --gf-bg-hover: ${darkColors.backgroundTertiary.hex};
  --gf-border: ${darkColors.border.hex};
  --gf-border-strong: rgba(255, 255, 255, 0.18);
  --gf-text-primary: ${darkColors.foreground.hex};
  --gf-text-secondary: ${darkColors.secondaryForeground.hex};
  --gf-text-muted: ${darkColors.mutedForeground.hex};
  --gf-text-faint: rgba(244, 244, 245, 0.22);
  --gf-accent: ${darkColors.primary.hex};
  --gf-accent-foreground: ${darkColors.primaryForeground.hex};
  --gf-accent-hover: #e4e4e7;
  --gf-success: ${darkColors.success.hex};
  --gf-warning: ${darkColors.warning.hex};
  --gf-danger: ${darkColors.destructive.hex};
  --gf-info: ${darkColors.info.hex};
  --gf-platform-youtube: #ff0000;
  --gf-platform-tiktok: #fe2c55;
  --gf-platform-linkedin: #0a66c2;
  --gf-radius-sm: ${radiusTokens.sm};
  --gf-radius-md: ${radiusTokens.md};
  --gf-radius-lg: ${radiusTokens.lg};
  --gf-radius-xl: ${radiusTokens.xl};
  --gf-shadow-border: inset 0 0 0 1px var(--gf-border);
  --gf-shadow-border-strong: inset 0 0 0 1px var(--gf-border-strong);
}
.gf-card {
  position: relative;
  overflow: hidden;
  border: 0;
  border-radius: var(--gf-radius-md);
  background: var(--gf-bg-secondary);
  color: var(--gf-text-primary);
  box-shadow: var(--gf-shadow-border);
  text-align: left;
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.gf-card:hover {
  box-shadow: var(--gf-shadow-border-strong);
}
.gf-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gf-border-strong);
  border-radius: var(--gf-radius-md);
  background: transparent;
  color: var(--gf-text-primary);
  padding: 0 14px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: background-color 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
}
.gf-button:hover {
  border-color: var(--gf-text-muted);
  background: var(--gf-bg-hover);
}
.gf-button-primary {
  border-color: var(--gf-accent);
  background: var(--gf-accent);
  color: var(--gf-accent-foreground);
}
.gf-button-primary:hover {
  border-color: var(--gf-accent-hover);
  background: var(--gf-accent-hover);
  color: var(--gf-accent-foreground);
}
.gf-button-secondary {
  background: var(--gf-bg-secondary);
  color: var(--gf-text-secondary);
}
.gf-badge,
.gf-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-md);
  background: rgba(255, 255, 255, 0.025);
  color: var(--gf-text-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.gf-badge {
  padding: 5px 8px;
}
.gf-chip {
  gap: 7px;
  padding: 6px 8px;
  color: var(--gf-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}
.gf-inline-code,
.gf-code-block {
  font-family: "SF Mono", SFMono-Regular, Consolas, Menlo, monospace;
}
.gf-inline-code {
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: rgba(255, 255, 255, 0.035);
  color: var(--gf-text-secondary);
  padding: 1px 5px;
  font-size: 11px;
}
.gf-code-block {
  max-width: 100%;
  overflow-x: auto;
  border: 0;
  border-radius: var(--gf-radius-md);
  background: var(--gf-bg-primary);
  color: #dbeafe;
  box-shadow: var(--gf-shadow-border);
  font-size: 12px;
  line-height: 1.7;
  padding: 13px;
  white-space: pre;
}
.gf-warning-note {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  border: 1px solid rgba(245, 158, 11, 0.26);
  border-radius: var(--gf-radius-md);
  background: rgba(245, 158, 11, 0.08);
  color: var(--gf-text-secondary);
  padding: 14px;
  font-size: 12px;
  line-height: 1.6;
}
`;
