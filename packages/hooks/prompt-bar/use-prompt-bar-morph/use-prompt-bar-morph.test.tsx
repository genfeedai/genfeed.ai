import { usePromptBarMorph } from '@hooks/prompt-bar/use-prompt-bar-morph/use-prompt-bar-morph';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let measuredHeight = 100;

function Bar({ isResting }: { isResting: boolean }) {
  const shellRef = usePromptBarMorph(isResting);
  return (
    <div data-testid="shell" ref={shellRef}>
      <span>{isResting ? 'resting' : 'open'}</span>
    </div>
  );
}

function mockReducedMotion(isReduced: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: isReduced }));
}

describe('usePromptBarMorph', () => {
  beforeEach(() => {
    measuredHeight = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height: measuredHeight }) as DOMRect,
    );
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('glides the height from the old layout to the new one when the state switches', () => {
    const { getByTestId, rerender } = render(<Bar isResting={false} />);
    const shell = getByTestId('shell');
    expect(shell.style.height).toBe('');

    measuredHeight = 40;
    rerender(<Bar isResting />);

    expect(shell.style.height).toBe('40px');
    expect(shell.style.transition).toContain('height 240ms');
  });

  it('does not animate on the first render or when nothing switched', () => {
    const { getByTestId, rerender } = render(<Bar isResting={false} />);
    rerender(<Bar isResting={false} />);

    expect(getByTestId('shell').style.transition).toBe('');
  });

  it('switches instantly when the user prefers reduced motion', () => {
    mockReducedMotion(true);
    const { getByTestId, rerender } = render(<Bar isResting={false} />);

    measuredHeight = 40;
    rerender(<Bar isResting />);

    expect(getByTestId('shell').style.transition).toBe('');
  });

  it('releases the inline height once the transition ends', () => {
    const { getByTestId, rerender } = render(<Bar isResting={false} />);
    const shell = getByTestId('shell');

    measuredHeight = 40;
    rerender(<Bar isResting />);
    const end = new Event('transitionend');
    Object.assign(end, { propertyName: 'height' });
    shell.dispatchEvent(end);

    expect(shell.style.height).toBe('');
    expect(shell.style.transition).toBe('');
  });
});
