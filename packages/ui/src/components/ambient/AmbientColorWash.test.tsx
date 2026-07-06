import { render } from '@testing-library/react';
import AmbientColorWash from '@ui/ambient/AmbientColorWash';
import { describe, expect, it } from 'vitest';

describe('AmbientColorWash', () => {
  it('renders nothing when no colour is supplied', () => {
    const { container } = render(<AmbientColorWash color={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for undefined colour', () => {
    const { container } = render(<AmbientColorWash />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a decorative wash carrying the colour custom property', () => {
    const { container } = render(<AmbientColorWash color="rgb(120 80 200)" />);
    const wash = container.firstChild as HTMLElement;

    expect(wash).not.toBeNull();
    expect(wash).toHaveClass('gen-ambient-wash');
    expect(wash.getAttribute('aria-hidden')).toBe('true');
    expect(wash.style.getPropertyValue('--gen-ambient-color')).toBe(
      'rgb(120 80 200)',
    );
  });

  it('applies the intensity modifier', () => {
    const { container } = render(
      <AmbientColorWash color="rgb(0 0 0)" intensity="bold" />,
    );
    expect(container.firstChild).toHaveClass('gen-ambient-wash--bold');
  });

  it('applies the center position modifier', () => {
    const { container } = render(
      <AmbientColorWash color="rgb(0 0 0)" position="center" />,
    );
    expect(container.firstChild).toHaveClass('gen-ambient-wash--center');
  });

  it('does not apply a modifier class for default intensity', () => {
    const { container } = render(<AmbientColorWash color="rgb(0 0 0)" />);
    const wash = container.firstChild as HTMLElement;
    expect(wash).not.toHaveClass('gen-ambient-wash--bold');
    expect(wash).not.toHaveClass('gen-ambient-wash--subtle');
  });
});
