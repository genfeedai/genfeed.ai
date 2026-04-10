import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPreview from './EditorPreview';
import '@testing-library/jest-dom';

vi.mock('next/dynamic', async () => {
  const React = await import('react');

  return {
    default: () =>
      React.forwardRef((_props, ref) => {
        React.useImperativeHandle(ref, () => ({
          addEventListener: vi.fn(),
          getCurrentFrame: vi.fn(() => 0),
          pause: vi.fn(),
          play: vi.fn(),
          removeEventListener: vi.fn(),
          seekTo: vi.fn(),
          toggle: vi.fn(),
        }));

        return <div data-testid="mock-player" />;
      }),
  };
});

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  const MockPlayer = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      addEventListener: vi.fn(),
      getCurrentFrame: vi.fn(() => 0),
      pause: vi.fn(),
      play: vi.fn(),
      removeEventListener: vi.fn(),
      seekTo: vi.fn(),
      toggle: vi.fn(),
    }));

    return <div data-testid="mock-player" />;
  });

  return { Player: MockPlayer };
});

describe('EditorPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorPreview
        tracks={[]}
        width={1920}
        height={1080}
        fps={30}
        totalFrames={300}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
