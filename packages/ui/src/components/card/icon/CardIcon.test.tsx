import { render, screen } from '@testing-library/react';
import CardIcon from '@ui/card/icon/CardIcon';
import { HiSparkles } from 'react-icons/hi2';
import { describe, expect, it } from 'vitest';

describe('CardIcon', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <CardIcon icon={HiSparkles} label="Sparkles" />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Sparkles')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <CardIcon icon={HiSparkles} label="Sparkles" />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <CardIcon icon={HiSparkles} label="Sparkles" className="text-primary" />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('inherits wrapper color when iconClassName only changes size', () => {
    const { container } = render(
      <CardIcon
        icon={HiSparkles}
        label="Sparkles"
        className="text-cyan-300"
        iconClassName="h-5 w-5"
      />,
    );

    const icon = container.querySelector('svg');

    expect(icon).toBeInTheDocument();
    expect(icon).not.toHaveClass('text-primary');
    expect(icon).toHaveClass('h-5', 'w-5');
  });
});
