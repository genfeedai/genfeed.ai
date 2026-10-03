import { brandGenerationRulesV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandOsGenerationRulesReview from './BrandOsGenerationRulesReview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandOsSettings.generationRulesReview');
  return { useTranslations: () => t };
});

function rules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [
      {
        id: 'source-one',
        sourceType: 'manual',
        label: 'Owner source',
        sourceId: 'source-record',
        sourceVersion: 3,
        url: 'https://example.com/evidence',
        excerpt: '<script>alert(1)</script>\nÉvidence 完整',
        contentHash: `sha256:${'a'.repeat(64)}`,
        confidence: 0.75,
      },
    ],
    facts: [
      {
        id: 'fact-one',
        kind: 'testimonial',
        subject: 'Customer Ω',
        predicate: 'reported',
        value: 'Exact customer statement\n第二行',
        unit: 'points',
        qualifier: 'In the recorded survey',
        attributedTo: 'Named respondent',
        match: 'literal',
        required: true,
        appliesToMediaKinds: ['text', 'image'],
        evidenceIds: ['source-one'],
      },
    ],
    approvedLiterals: [
      {
        id: 'literal:one',
        kind: 'fact',
        factRuleId: 'fact-one',
        text: 'Saved literal <img src=x onerror=alert(1)>\nUnicode Ω 完整',
        evidenceIds: ['source-one'],
      },
      {
        id: 'literal:copy',
        kind: 'approved_copy',
        text: 'Exact copy wording',
        evidenceIds: ['source-one'],
      },
    ],
    palette: [
      {
        id: 'palette-one',
        color: '#ABCDEF',
        usage: 'Primary surface',
        required: false,
        evidenceIds: ['source-one'],
      },
    ],
    typography: [
      {
        id: 'font-owned',
        family: 'Owner Family',
        role: 'Heading',
        weight: 700,
        style: 'italic',
        availability: 'owned_asset',
        fontAssetReferenceId: 'font-reference',
        required: true,
        evidenceIds: ['source-one'],
      },
      {
        id: 'font-runtime',
        family: 'Runtime Family',
        role: 'Body',
        weight: 400,
        style: 'normal',
        availability: 'verified_runtime',
        runtimeFontId: 'recorded-runtime-id',
        required: false,
        evidenceIds: ['source-one'],
      },
      {
        id: 'font-unavailable',
        family: 'Unavailable Family',
        role: 'Caption',
        weight: 300,
        style: 'oblique',
        availability: 'unavailable',
        required: false,
        evidenceIds: ['source-one'],
      },
      {
        id: 'font-unknown',
        family: 'Unknown Family',
        role: 'Footer',
        weight: 500,
        style: 'normal',
        availability: 'unknown',
        required: false,
        evidenceIds: ['source-one'],
      },
    ],
    mandatory: [
      {
        id: 'mandatory-one',
        text: 'Mandatory full wording\nNo truncation',
        match: 'literal',
        required: true,
        evidenceIds: ['source-one'],
      },
    ],
    avoid: [
      {
        id: 'avoid-one',
        text: 'Avoid full wording',
        match: 'semantic',
        required: false,
        evidenceIds: ['source-one'],
      },
    ],
    examples: [
      {
        id: 'example-one',
        polarity: 'negative',
        text: 'Full example Ω\nNext line',
        evidenceIds: ['source-one'],
      },
    ],
    assets: [
      {
        id: 'font-reference',
        assetId: 'font-asset',
        role: 'font',
        contentHash: `sha256:${'b'.repeat(64)}`,
        mimeType: 'font/woff2',
        required: true,
        evidenceIds: ['source-one'],
      },
      {
        id: 'logo-reference',
        assetId: 'logo-asset',
        role: 'logo',
        contentHash: `sha256:${'c'.repeat(64)}`,
        mimeType: 'image/png',
        required: true,
        appliesToMediaKinds: ['image'],
        evidenceIds: ['source-one'],
        textCoverage: {
          kind: 'approved_literals',
          literalIds: ['literal:one'],
          evidenceIds: ['source-one'],
        },
      },
    ],
  };
}

function emptyRules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [],
    facts: [],
    palette: [],
    typography: [],
    mandatory: [],
    avoid: [],
    examples: [],
    assets: [],
  };
}

describe('saved generation rules presentation', () => {
  it('renders the complete canonical catalogue and source metadata as escaped text without fetching or applying fonts', () => {
    const saved = brandGenerationRulesV1Schema.parse(rules());
    const { container } = render(
      <BrandOsGenerationRulesReview
        rules={saved}
        acknowledged={false}
        isDisabled={false}
        showAcknowledgement={false}
        onAcknowledgedChange={vi.fn()}
      />,
    );
    for (const [section, values] of [
      [
        'Facts',
        [
          'fact-one',
          'testimonial',
          'Customer Ω',
          'reported',
          'Exact customer statement',
          '第二行',
          'points',
          'In the recorded survey',
          'Named respondent',
          'literal',
          'text, image',
          'source-one',
        ],
      ],
      [
        'Saved literal wording',
        [
          'literal:one',
          'fact-one',
          'Saved literal <img src=x onerror=alert(1)>',
          'Unicode Ω 完整',
          'Exact copy wording',
          'approved_copy',
        ],
      ],
      ['Palette', ['#ABCDEF', 'Primary surface', 'Optional', 'All media']],
      [
        'Typography',
        [
          'Owner Family',
          '700',
          'italic',
          'font-reference',
          'Runtime Family',
          '400',
          'recorded-runtime-id',
          'Recorded owned font asset',
          'Recorded runtime font identity',
          'Font unavailable',
          'Availability not verified',
        ],
      ],
      [
        'Mandatory wording',
        ['Mandatory full wording', 'No truncation', 'literal', 'Required'],
      ],
      ['Wording to avoid', ['Avoid full wording', 'semantic']],
      ['Examples', ['negative', 'Full example Ω', 'Next line']],
      [
        'Assets',
        [
          'font-asset',
          'font/woff2',
          'logo-asset',
          'image/png',
          `sha256:${'c'.repeat(64)}`,
          'approved_literals',
          'literal:one',
          'source-one',
        ],
      ],
      [
        'Evidence',
        [
          'Owner source',
          'manual',
          'source-record',
          '3',
          'https://example.com/evidence',
          '<script>alert(1)</script>',
          'Évidence 完整',
          `sha256:${'a'.repeat(64)}`,
          '0.75',
        ],
      ],
    ] as const) {
      const region = screen.getByRole('region', { name: section });
      for (const value of values) expect(region.textContent).toContain(value);
    }
    expect(container.textContent).toContain('Exact customer statement\n第二行');
    expect(container.querySelector('script, img, a, style')).toBeNull();
    expect(container.querySelector('[style*="font-family"]')).toBeNull();
    expect(
      screen.getByText(
        /Approval does not verify facts, asset availability or font rendering/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows explicit empty states without inventing literals or media rules', () => {
    render(
      <BrandOsGenerationRulesReview
        rules={emptyRules()}
        acknowledged={false}
        isDisabled={true}
        showAcknowledgement={false}
        onAcknowledgedChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText('No entries saved.')).toHaveLength(9);
    expect(screen.queryByText('All media')).not.toBeInTheDocument();
  });

  it('keeps acknowledgement controlled and disables interaction when requested', () => {
    const onAcknowledgedChange = vi.fn();
    const view = render(
      <BrandOsGenerationRulesReview
        rules={emptyRules()}
        acknowledged={false}
        isDisabled={false}
        showAcknowledgement={true}
        onAcknowledgedChange={onAcknowledgedChange}
      />,
    );
    const checkbox = screen.getByRole('checkbox', {
      name: 'I have reviewed the saved generation rules and their sources.',
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(onAcknowledgedChange).toHaveBeenCalledExactlyOnceWith(true);
    view.rerender(
      <BrandOsGenerationRulesReview
        rules={emptyRules()}
        acknowledged={true}
        isDisabled={true}
        showAcknowledgement={true}
        onAcknowledgedChange={onAcknowledgedChange}
      />,
    );
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(
      within(
        screen.getByRole('region', { name: 'Saved generation rules' }),
      ).getByRole('checkbox'),
    ).toBe(checkbox);
  });
});
