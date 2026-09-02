import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { CredentialPlatform } from '@genfeedai/contracts';
import {
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import TargetPreview from './TargetPreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('TargetPreview', () => {
  it('routes a known platform to its dedicated renderer', () => {
    render(
      <TargetPreview
        credential={makeCredential({ platform: CredentialPlatform.TWITTER })}
        release={makeRelease({ baseContent: 'x'.repeat(300) })}
        target={makeTarget({ platform: CredentialPlatform.TWITTER })}
      />,
    );

    // X truncates at 280 chars — proof the dedicated XPreview rendered.
    expect(screen.getByText(`${'x'.repeat(280)}...`)).toBeInTheDocument();
  });

  it('falls back to a neutral card for a platform with no dedicated renderer', () => {
    render(
      <TargetPreview
        credential={makeCredential({ platform: CredentialPlatform.REDDIT })}
        release={makeRelease({ baseContent: 'Untruncated fallback caption' })}
        target={makeTarget({ platform: CredentialPlatform.REDDIT })}
      />,
    );

    expect(screen.getByText('Approximate preview')).toBeInTheDocument();
    expect(
      screen.getByText('Untruncated fallback caption'),
    ).toBeInTheDocument();
  });
});
