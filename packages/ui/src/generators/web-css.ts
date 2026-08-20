import { semanticColorTokens } from '@ui/core/colors';
import { elevationTokens, focusTokens } from '@ui/core/elevation';
import { motionTokens } from '@ui/core/motion';
import { radiusTokens } from '@ui/core/radius';
import {
  backgroundScale,
  neutralAlphaScale,
  neutralScale,
} from '@ui/core/scales';
import { sizingTokens } from '@ui/core/sizing';
import { spacingTokens } from '@ui/core/spacing';
import { typographyTokens } from '@ui/core/typography';

/** `invFg` is the one role whose CSS name is not a plain kebab-case of the key. */
const RGB_TRIPLE_ROLES = new Set(['surface', 'fill', 'edge', 'inv', 'invFg']);

function kebab(tokenName: string): string {
  return tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function declaration(name: string, value: string, indent: string): string {
  return `${indent}--${name}: ${value};`;
}

/** Values that change with the theme. Emitted once per theme block. */
function themedVariables(theme: 'light' | 'dark', indent: string): string {
  const semanticEntries = Object.entries(semanticColorTokens[theme]).map(
    ([tokenName, value]) =>
      declaration(
        RGB_TRIPLE_ROLES.has(tokenName)
          ? tokenName === 'invFg'
            ? 'inv-fg'
            : tokenName
          : kebab(tokenName),
        value.hsl,
        indent,
      ),
  );

  const scaleEntries = Object.entries(neutralScale[theme]).map(
    ([step, value]) => declaration(`gray-${step}`, value.hsl, indent),
  );
  const alphaScaleEntries = Object.entries(neutralAlphaScale[theme]).map(
    ([step, value]) => declaration(`gray-alpha-${step}`, value, indent),
  );
  const backgroundScaleEntries = Object.entries(backgroundScale[theme]).map(
    ([step, value]) => declaration(`background-${step}`, value.hsl, indent),
  );
  const elevationEntries = Object.entries(elevationTokens[theme]).map(
    ([tokenName, value]) => declaration(kebab(tokenName), value, indent),
  );

  return [
    ...semanticEntries,
    ...scaleEntries,
    ...alphaScaleEntries,
    ...backgroundScaleEntries,
    ...elevationEntries,
  ].join('\n');
}

/** Values that are identical in both themes. Emitted once, outside `@layer base`. */
function invariantVariables(indent: string): string {
  const typographyEntries = Object.entries(typographyTokens).map(
    ([tokenName, value]) => declaration(kebab(tokenName), value, indent),
  );
  const spacingEntries = Object.entries(spacingTokens).map(
    ([tokenName, value]) => declaration(`space-${tokenName}`, value, indent),
  );
  const radiusEntries = Object.entries(radiusTokens).map(([tokenName, value]) =>
    declaration(`radius-${kebab(tokenName)}`, value, indent),
  );
  const motionEntries = Object.entries(motionTokens).map(([tokenName, value]) =>
    declaration(`motion-${kebab(tokenName)}`, value, indent),
  );
  const sizingEntries = Object.entries(sizingTokens).map(([tokenName, value]) =>
    declaration(kebab(tokenName), value, indent),
  );
  const focusEntries = Object.entries(focusTokens).map(([tokenName, value]) =>
    declaration(kebab(tokenName), value, indent),
  );

  return [
    ...typographyEntries,
    ...spacingEntries,
    ...radiusEntries,
    ...motionEntries,
    ...sizingEntries,
    ...focusEntries,
  ].join('\n');
}

export function generateWebTokenCss(): string {
  const invariants = invariantVariables('  ');
  const lightVariables = themedVariables('light', '    ');
  const darkVariables = themedVariables('dark', '    ');
  const darkSystemVariables = themedVariables('dark', '      ');

  return `:root {
${invariants}
}

@layer base {
  :root,
  [data-theme='light'] {
${lightVariables}
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) {
${darkSystemVariables}
    }
  }

  [data-theme='dark'] {
${darkVariables}
  }
}`;
}

export const webTokenCss = generateWebTokenCss();
