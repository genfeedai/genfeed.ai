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
  featureCard: 'gf-card gf-feature-card',
  featureCardCopy: 'gf-feature-card-copy',
  featureCardInner: 'gf-feature-card-inner',
  featureCardKicker: 'gf-feature-card-kicker',
  featureCardTitle: 'gf-feature-card-title',
  infoCard: 'gf-card gf-info-card',
  inlineCode: 'gf-inline-code',
  root: 'gf-ui',
  warningNote: 'gf-warning-note',
} as const;

export const staticSurfaceCss = `
.gf-ui {
  /* Brand typography contract. "Satoshi" resolves wherever a real
     @font-face{font-family:"Satoshi"} is present (the MCP setup page inlines it);
     otherwise it falls through to the system sans stack. This is the single knob
     that keeps every static-surface consumer on the product's sans, not Georgia. */
  --gf-font-sans: "Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --gf-font-serif: "Zodiak", Georgia, "Times New Roman", serif;
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
  /* Single knob for the editorial "sharp border" surface language. Mirrors the
     canonical --radius-card (sharp 0px). Raise to a token (e.g. ${radiusTokens.xs})
     to soften every surface at once. */
  --gf-surface-radius: ${radiusTokens.none};
  --gf-shadow-border: inset 0 0 0 1px var(--gf-border);
  --gf-shadow-border-strong: inset 0 0 0 1px var(--gf-border-strong);
}
.gf-card {
  position: relative;
  overflow: hidden;
  border: 0;
  border-radius: var(--gf-surface-radius);
  background: var(--gf-bg-secondary);
  color: var(--gf-text-primary);
  box-shadow: var(--gf-shadow-border);
  text-align: left;
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.gf-card:hover {
  box-shadow: var(--gf-shadow-border-strong);
}
.gf-feature-card {
  min-height: 430px;
  background: var(--gf-bg-tertiary);
  padding: 34px;
}
.gf-feature-card::before {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
  background-size: 96px 96px;
  content: "";
  opacity: 0.28;
}
.gf-feature-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 360px;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
}
.gf-feature-card-kicker {
  margin: 0;
  color: var(--gf-text-faint);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.gf-feature-card-title {
  max-width: 350px;
  margin: 18px 0 0;
  font-family: var(--gf-font-sans);
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
}
.gf-feature-card-copy {
  max-width: 330px;
  margin: 14px 0 0;
  color: var(--gf-text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.gf-info-card {
  min-height: 190px;
  padding: 22px;
}
.gf-info-card h3 {
  margin: 14px 0 0;
  color: var(--gf-text-primary);
  font-size: 15px;
  font-weight: 750;
}
.gf-info-card p {
  margin: 9px 0 0;
  color: var(--gf-text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.gf-info-card a {
  display: inline-flex;
  margin-top: 16px;
  color: var(--gf-text-secondary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.gf-info-card a:hover {
  color: var(--gf-text-primary);
}
.gf-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gf-border-strong);
  border-radius: var(--gf-surface-radius);
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
  border-radius: var(--gf-surface-radius);
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
  border-radius: var(--gf-surface-radius);
  background: rgba(255, 255, 255, 0.035);
  color: var(--gf-text-secondary);
  padding: 1px 5px;
  font-size: 11px;
}
.gf-code-block {
  max-width: 100%;
  overflow-x: auto;
  border: 0;
  border-radius: var(--gf-surface-radius);
  background: var(--gf-bg-primary);
  color: var(--gf-text-secondary);
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
  border: 1px solid color-mix(in srgb, var(--gf-warning) 26%, transparent);
  border-radius: var(--gf-surface-radius);
  background: color-mix(in srgb, var(--gf-warning) 8%, transparent);
  color: var(--gf-text-secondary);
  padding: 14px;
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 920px) {
  .gf-feature-card {
    min-height: 360px;
  }
}
@media (max-width: 640px) {
  .gf-feature-card {
    padding: 22px;
  }
  .gf-feature-card-title {
    font-size: 34px;
  }
}
`;
