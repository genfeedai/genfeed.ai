import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import {
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import ThreadsPreview from './ThreadsPreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ThreadsPreview', () => {
  it('truncates the caption at the Threads 500-character limit', () => {
    const caption = 'x'.repeat(510);
    render(
      <ThreadsPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: caption })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText(`${'x'.repeat(500)}...`)).toBeInTheDocument();
  });

  it('renders an empty-caption placeholder when there is no text', () => {
    render(
      <ThreadsPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: '   ' })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText('No caption yet')).toBeInTheDocument();
  });
});
