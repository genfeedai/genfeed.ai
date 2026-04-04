import PromptBarsImageMerge from '@pages/studio/prompt-bars/PromptBarsImageMerge';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('PromptBarsImageMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarsImageMerge onSubmit={vi.fn()} isLoading={false} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
