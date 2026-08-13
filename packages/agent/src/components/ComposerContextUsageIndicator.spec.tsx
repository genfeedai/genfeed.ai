import { ComposerContextUsageIndicator } from '@genfeedai/agent/components/ComposerContextUsageIndicator';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ComposerContextUsageIndicator', () => {
  it('renders a compact used/window label', () => {
    render(
      <ComposerContextUsageIndicator
        usage={{
          label: '12k / 128k',
          ratio: 0.1,
          usedTokens: 12_400,
          windowTokens: 128_000,
        }}
      />,
    );

    expect(screen.getByTestId('composer-context-usage')).toHaveTextContent(
      '12k / 128k',
    );
  });

  it('hides when no tokens are used', () => {
    const { container } = render(
      <ComposerContextUsageIndicator
        usage={{
          label: '0 / 128k',
          ratio: 0,
          usedTokens: 0,
          windowTokens: 128_000,
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
