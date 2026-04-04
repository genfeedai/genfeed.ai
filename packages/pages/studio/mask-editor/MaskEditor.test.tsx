import MaskEditor from '@pages/studio/mask-editor/MaskEditor';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

describe('MaskEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <MaskEditor
        imageUrl="https://example.com/image.png"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
