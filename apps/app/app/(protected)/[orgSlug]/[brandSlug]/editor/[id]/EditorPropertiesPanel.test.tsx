import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPropertiesPanel from './EditorPropertiesPanel';
import '@testing-library/jest-dom';

describe('EditorPropertiesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<EditorPropertiesPanel />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
