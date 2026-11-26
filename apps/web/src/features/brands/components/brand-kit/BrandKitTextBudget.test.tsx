import type { IBrandKitRequiredTextContext } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import BrandKitTextBudget from '@/features/brands/components/brand-kit/BrandKitTextBudget';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function report(
  requiredCharacters: number,
  fields: IBrandKitRequiredTextContext['fields'],
): IBrandKitRequiredTextContext {
  return {
    fields,
    maxCharacters: 6000,
    overflowCharacters: Math.max(0, requiredCharacters - 6000),
    requiredCharacters,
  };
}

describe('BrandKitTextBudget', () => {
  it('shows the count and the longest fields when the kit fits', () => {
    render(
      <BrandKitTextBudget
        isApproved={false}
        isDirty={false}
        report={report(772, [
          { characters: 110, field: 'promptGuidelines' },
          { characters: 58, field: 'description' },
          { characters: 2, field: 'voiceDoNotSoundLike' },
        ])}
      />,
    );

    expect(screen.getByText('772 of 6,000 characters')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Identity and writing voice go into every text generation whole. Longest: Prompt guidelines (110), Description (58).',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses an over-budget draft and names the fields to shorten', () => {
    render(
      <BrandKitTextBudget
        isApproved={false}
        isDirty={false}
        report={report(6844, [
          { characters: 6182, field: 'promptGuidelines' },
          { characters: 58, field: 'description' },
        ])}
      />,
    );

    expect(screen.getByText('Too long to approve')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The Brand Kit text a generation must carry is 6,844 characters and the limit is 6,000, so it is 844 too long. Shorten the longest fields: Prompt guidelines (6,182 characters), Description (58 characters).',
      ),
    ).toBeInTheDocument();
  });

  it('warns that posts fail when the approved kit is over budget', () => {
    render(
      <BrandKitTextBudget
        isApproved
        isDirty={false}
        report={report(6844, [{ characters: 6182, field: 'promptGuidelines' }])}
      />,
    );

    expect(
      screen.getByText('Posts for this brand fail until this is shortened'),
    ).toBeInTheDocument();
  });

  it('says the count is from the last save while edits are waiting', () => {
    render(
      <BrandKitTextBudget
        isApproved={false}
        isDirty
        report={report(772, [{ characters: 110, field: 'promptGuidelines' }])}
      />,
    );

    expect(
      screen.getByText('Counted from the last saved draft. Save to update it.'),
    ).toBeInTheDocument();
  });

  it('renders nothing before a revision is loaded', () => {
    const { container } = render(
      <BrandKitTextBudget isApproved={false} isDirty={false} report={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
