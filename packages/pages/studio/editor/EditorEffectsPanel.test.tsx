import EditorEffectsPanel from '@pages/studio/editor/EditorEffectsPanel';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('EditorEffectsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorEffectsPanel
        tracks={[]}
        selectedTrackId={null}
        selectedClipId={null}
        onTrackUpdate={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
