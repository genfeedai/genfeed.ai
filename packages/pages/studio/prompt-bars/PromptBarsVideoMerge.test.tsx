import PromptBarsVideoMerge from '@pages/studio/prompt-bars/PromptBarsVideoMerge';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('PromptBarsVideoMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarsVideoMerge onSubmit={vi.fn()} isLoading={false} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
