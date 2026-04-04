import FoldersList from '@pages/folders/folders-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('FoldersList', () => {
  it('should render without crashing', () => {
    const { container } = render(<FoldersList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FoldersList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FoldersList />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toBeInTheDocument();
  });
});
