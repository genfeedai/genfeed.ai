import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const translate = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({ useTranslations: () => translate }));

import ExpiredVideoNotice from '@ui/masonry/shared/ExpiredVideoNotice';

describe('ExpiredVideoNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says the file expired', () => {
    translate.mockImplementation((key: string) => `copy:${key}`);

    render(<ExpiredVideoNotice ingredientId="v1" />);

    expect(screen.getByTestId('video-expired-v1')).toHaveTextContent(
      'copy:title',
    );
  });

  it('renders nothing, instead of throwing, where there is no intl provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    translate.mockImplementation(() => {
      throw new Error('No intl context found');
    });

    const { container } = render(<ExpiredVideoNotice ingredientId="v2" />);

    expect(container).toBeEmptyDOMElement();
  });
});
