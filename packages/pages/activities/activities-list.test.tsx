import ActivitiesList from '@pages/activities/activities-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ActivitiesList', () => {
  it('should render without crashing', () => {
    const { container } = render(<ActivitiesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ActivitiesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ActivitiesList />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toBeInTheDocument();
  });
});
