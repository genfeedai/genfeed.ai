import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardRunPage from './StoryboardRunPage';

const mocks = vi.hoisted(() => ({ neutral: vi.fn(), legacy: vi.fn() }));
vi.mock('@pages/studio/storyboard/hooks/use-durable-storyboard-run', () => ({
  useDurableStoryboardRun: mocks.neutral,
}));
vi.mock('@pages/studio/storyboard/hooks/use-storyboard-capabilities', () => ({
  useStoryboardCapabilities: () => ({}),
}));
vi.mock('@pages/studio/storyboard/hooks/use-storyboard-run', () => ({
  useStoryboardRun: mocks.legacy,
}));
vi.mock('@pages/studio/storyboard/StoryboardDraftPage', () => ({
  default: () => <div>Native storyboard</div>,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
describe('Storyboard detail transition', () => {
  beforeEach(() => {
    mocks.neutral.mockReset();
    mocks.legacy.mockReset();
  });
  it('opens native runs with the new editor', () => {
    mocks.neutral.mockReturnValue({
      run: { id: 'native', config: { revision: 1 } },
    });
    render(<StoryboardRunPage runId="native" />);
    expect(screen.getByText('Native storyboard')).toBeInTheDocument();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it('preserves the existing Discovery detail on an explicit neutral 404', () => {
    mocks.neutral.mockReturnValue({ notFound: true, run: null });
    mocks.legacy.mockReturnValue({
      run: null,
      status: 'error',
      error: 'Existing Discovery detail',
    });
    render(<StoryboardRunPage runId="existing" />);
    expect(screen.getByText('Existing Discovery detail')).toBeInTheDocument();
  });
  it('does not fall back on permission, validation, or network errors', () => {
    mocks.neutral.mockReturnValue({
      notFound: false,
      run: null,
      error: 'Unavailable',
    });
    render(<StoryboardRunPage runId="native" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
