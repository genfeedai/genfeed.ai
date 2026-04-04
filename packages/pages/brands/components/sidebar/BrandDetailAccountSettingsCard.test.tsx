import '@testing-library/jest-dom/vitest';
import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('BrandDetailAccountSettingsCard', () => {
  it('should render without crashing', () => {
    render(
      <BrandDetailAccountSettingsCard isPublic={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText('Public Profile')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onToggle = vi.fn();
    render(
      <BrandDetailAccountSettingsCard isPublic={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailAccountSettingsCard isPublic={false} onToggle={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('card');
  });
});
