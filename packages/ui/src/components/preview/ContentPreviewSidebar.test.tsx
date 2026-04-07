import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import ContentPreviewSidebar from '@ui/preview/ContentPreviewSidebar';

describe('ContentPreviewSidebar', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ContentPreviewSidebar content="Test content" platform="twitter" />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});
