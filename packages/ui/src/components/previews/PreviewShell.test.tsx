import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { CredentialPlatform } from '@genfeedai/contracts';
import PreviewShell, { CaptionText } from './PreviewShell';
import { makeCredential } from './preview.test-helpers';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('PreviewShell', () => {
  it('shows the author name and handle from the credential', () => {
    render(
      <PreviewShell
        credential={makeCredential({
          externalHandle: 'genfeed',
          externalName: 'Genfeed',
        })}
        platform={CredentialPlatform.INSTAGRAM}
      >
        <span>content</span>
      </PreviewShell>,
    );

    expect(screen.getByText('Genfeed')).toBeInTheDocument();
    expect(screen.getByText('@genfeed')).toBeInTheDocument();
  });

  it('shows a custom eyebrow instead of the handle when provided', () => {
    render(
      <PreviewShell
        credential={makeCredential()}
        eyebrow="Approximate preview"
        platform={CredentialPlatform.REDDIT}
      >
        <span>content</span>
      </PreviewShell>,
    );

    expect(screen.getByText('Approximate preview')).toBeInTheDocument();
    expect(screen.queryByText('@genfeed')).not.toBeInTheDocument();
  });

  it('labels the article for the platform it represents', () => {
    render(
      <PreviewShell
        credential={makeCredential()}
        platform={CredentialPlatform.INSTAGRAM}
      >
        <span>content</span>
      </PreviewShell>,
    );

    expect(
      screen.getByLabelText('instagram platform preview'),
    ).toBeInTheDocument();
  });
});

describe('CaptionText', () => {
  it('renders the empty-caption placeholder for blank text', () => {
    render(<CaptionText text="   " />);

    expect(screen.getByText('No caption yet')).toBeInTheDocument();
  });
});
