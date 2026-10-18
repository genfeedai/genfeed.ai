import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts';
import type { IBrandPublishPolicy } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandOsPolicyEditor from './BrandOsPolicyEditor';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandOsSettings.policy');
  return { useTranslations: () => t };
});

function policy(patch: Partial<IBrandPublishPolicy> = {}): IBrandPublishPolicy {
  return { ...createDefaultBrandPublishPolicy('Europe/Paris'), ...patch };
}

function renderEditor(value?: IBrandPublishPolicy, isDisabled = false) {
  const onChange = vi.fn();
  render(
    <BrandOsPolicyEditor
      policy={value}
      isDisabled={isDisabled}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('BrandOsPolicyEditor', () => {
  it('explains the default that applies without a Policy and offers to customise it', () => {
    const onChange = renderEditor();

    expect(
      screen.getByText(
        'This revision has no Policy, so the default applies: video is reviewed, text and image earn autonomy, and nothing is banned or capped.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Policy' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomy: {
          formats: { image: 'earned', text: 'earned' },
          platforms: {},
        },
        version: 1,
      }),
    );
  });

  it('shows video as always reviewed, with no control to change it', () => {
    renderEditor(policy());

    expect(screen.getByText('Always reviewed')).toBeTruthy();
    expect(
      screen.queryByRole('combobox', { name: 'Autonomy for Video' }),
    ).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Autonomy for Text' }),
    ).toBeTruthy();
  });

  it('edits the banned lists one entry per line, without blank or duplicate lines', () => {
    const onChange = renderEditor(policy());

    fireEvent.change(screen.getByLabelText('Banned topics (one per line)'), {
      target: { value: 'Politics\n\n  Religion \nPolitics' },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bannedTopics: ['Politics', 'Religion'] }),
    );
  });

  it('turns caps and the quality minimum into bounded numbers, and blank into no limit', () => {
    const onChange = renderEditor(policy({ maxPostsPerDay: 3 }));

    fireEvent.change(screen.getByLabelText('Max unattended posts per week'), {
      target: { value: '9999' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxPostsPerWeek: 700 }),
    );
    fireEvent.change(screen.getByLabelText('Max unattended posts per day'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxPostsPerDay: null }),
    );
    fireEvent.change(screen.getByLabelText('Minimum quality score (0-100)'), {
      target: { value: '75' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minQualityScore: 75 }),
    );
  });

  it('keeps the last valid timezone while the typed one is unknown', () => {
    const onChange = renderEditor(policy());
    const input = screen.getByLabelText('Timezone (IANA, e.g. Europe/Paris)');

    fireEvent.change(input, { target: { value: 'Mars/Base' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Unknown timezone. The Policy keeps its last valid timezone.',
      ),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: 'America/New_York' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timezone: 'America/New_York' }),
    );
  });

  it('turns quiet hours and required checks on', () => {
    const onChange = renderEditor(policy());

    fireEvent.click(screen.getByLabelText('Quiet hours (no unattended posts)'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ quietHours: { end: '07:00', start: '22:00' } }),
    );
    fireEvent.click(screen.getByLabelText('Caption moderation'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiredChecks: ['moderation'] }),
    );
  });

  it('flags a Policy the server would refuse', () => {
    renderEditor(policy({ maxPostsPerDay: 10, maxPostsPerWeek: 5 }));

    expect(screen.getByRole('alert').textContent).toContain(
      'The daily cap cannot exceed the weekly cap',
    );
  });

  it('removes the Policy section', () => {
    const onChange = renderEditor(policy());

    fireEvent.click(screen.getByRole('button', { name: 'Remove Policy' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('locks every control for a member who cannot manage the brand', () => {
    renderEditor(policy(), true);

    expect(
      (
        screen.getByLabelText(
          'Banned topics (one per line)',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Remove Policy',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
