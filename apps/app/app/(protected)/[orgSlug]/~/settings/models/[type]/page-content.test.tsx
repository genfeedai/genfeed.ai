import { PageScope } from '@genfeedai/enums';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelsTypePageClientContent from './page-content';

const mockModelsList = vi.hoisted(() =>
  vi.fn(() => <div data-testid="models-list" />),
);
const mockTrainingsList = vi.hoisted(() =>
  vi.fn(() => <div data-testid="trainings-list" />),
);

vi.mock('@pages/models/list/models-list', () => ({
  default: mockModelsList,
}));

vi.mock('@pages/trainings/list/trainings-list', () => ({
  default: mockTrainingsList,
}));

describe('ModelsTypePageClientContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ModelsList for model categories other than trainings', () => {
    render(<ModelsTypePageClientContent type="videos" />);

    expect(mockModelsList).toHaveBeenCalledTimes(1);
    expect(mockModelsList).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'videos',
        onRefreshRegister: expect.any(Function),
        scope: PageScope.ORGANIZATION,
      }),
      undefined,
    );
    expect(mockTrainingsList).not.toHaveBeenCalled();
  });

  it('renders TrainingsList when the type is trainings', () => {
    render(<ModelsTypePageClientContent type="trainings" />);

    expect(mockTrainingsList).toHaveBeenCalledTimes(1);
    expect(mockTrainingsList).toHaveBeenCalledWith(
      expect.objectContaining({
        onRefreshRegister: expect.any(Function),
        scope: PageScope.ORGANIZATION,
      }),
      undefined,
    );
    expect(mockModelsList).not.toHaveBeenCalled();
  });
});
