import { semanticColorTokens } from '@ui/core/colors';
import { motionTokens } from '@ui/core/motion';
import { radiusTokens } from '@ui/core/radius';
import { spacingTokens } from '@ui/core/spacing';
import { typographyTokens } from '@ui/core/typography';

function cssVariablesForTheme(theme: 'light' | 'dark'): string {
  const semanticEntries = Object.entries(semanticColorTokens[theme]).map(
    ([tokenName, value]) => {
      if (
        tokenName === 'surface' ||
        tokenName === 'fill' ||
        tokenName === 'edge' ||
        tokenName === 'inv' ||
        tokenName === 'invFg'
      ) {
        return `    --${tokenName === 'invFg' ? 'inv-fg' : tokenName}: ${value.hsl};`;
      }

      const cssName = tokenName.replace(
        /[A-Z]/g,
        (match) => `-${match.toLowerCase()}`,
      );
      return `    --${cssName}: ${value.hsl};`;
    },
  );

  const typographyEntries = Object.entries(typographyTokens).map(
    ([tokenName, value]) =>
      `    --${tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}: ${value};`,
  );
  const spacingEntries = Object.entries(spacingTokens).map(
    ([tokenName, value]) => `    --space-${tokenName}: ${value};`,
  );
  const radiusEntries = Object.entries(radiusTokens).map(
    ([tokenName, value]) => `    --radius-${tokenName}: ${value};`,
  );
  const motionEntries = Object.entries(motionTokens).map(
    ([tokenName, value]) =>
      `    --motion-${tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}: ${value};`,
  );

  return [
    ...semanticEntries,
    ...typographyEntries,
    ...spacingEntries,
    ...radiusEntries,
    ...motionEntries,
  ].join('\n');
}

export function generateWebTokenCss(): string {
  const lightVariables = cssVariablesForTheme('light');
  const darkVariables = cssVariablesForTheme('dark');

  return `@layer base {
  :root,
  [data-theme='light'] {
${lightVariables}
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) {
${darkVariables}
    }
  }

  [data-theme='dark'] {
${darkVariables}
  }
}`;
}

export const webTokenCss = generateWebTokenCss();
