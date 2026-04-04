import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import * as PlatformIconHelper from '@helpers/ui/platform-icon/platform-icon.helper';

describe('PlatformIconHelper', () => {
  it('should get platform icon for youtube', () => {
    const icon = PlatformIconHelper.getPlatformIcon('youtube');
    expect(icon).not.toBeNull();
    render(<div data-testid="icon-container">{icon}</div>);
    expect(screen.getByTestId('icon-container')).toBeInTheDocument();
  });

  it('should return null for unknown platform', () => {
    const icon = PlatformIconHelper.getPlatformIcon('unknown-platform');
    expect(icon).toBeNull();
  });

  it('should get platform icon component for youtube', () => {
    const IconComponent =
      PlatformIconHelper.getPlatformIconComponent('youtube');
    expect(IconComponent).toBeDefined();
    if (IconComponent) {
      render(
        <div data-testid="icon-wrapper">
          <IconComponent className="test-class" />
        </div>,
      );
      expect(
        screen.getByTestId('icon-wrapper').querySelector('svg'),
      ).toBeInTheDocument();
    }
  });

  it('should return undefined for unknown platform component', () => {
    const IconComponent =
      PlatformIconHelper.getPlatformIconComponent('unknown-platform');
    expect(IconComponent).toBeUndefined();
  });
});
