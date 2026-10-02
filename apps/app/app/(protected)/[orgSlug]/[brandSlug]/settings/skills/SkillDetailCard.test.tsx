// @vitest-environment jsdom
import type { SkillDraft } from '@props/settings/skills.props';
import type { Skill } from '@services/content/skills.service';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SkillDetailCard from './SkillDetailCard';
import { prepareSkillDraftPatch } from './skill-draft-patch';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');
  return { useTranslations: () => translate };
});
const skill: Skill = {
  id: 'personal',
  name: 'Name',
  description: 'Definition',
  canEdit: true,
  canFork: true,
  organization: null,
  channels: [],
  modalities: ['text'],
  workflowStage: 'creation',
  category: 'content',
  isBuiltIn: false,
  isEnabled: true,
  requiredProviders: [],
  slug: 'personal',
  source: 'custom',
  status: 'draft',
};
const original: SkillDraft = {
  name: 'Name',
  description: 'Definition',
  defaultInstructions: '',
  systemPromptTemplate: '',
};
describe('SkillDetailCard', () => {
  it('exposes accessible changed-field errors without truncation and clears them on revert', () => {
    const invalid = { ...original, name: 'x'.repeat(141) };
    const props = {
      customizing: false,
      savingSkill: false,
      selectedSkill: skill,
      skillDraft: invalid,
      onCustomize: vi.fn(),
      onSaveSkill: vi.fn(),
      onSkillDraftChange: vi.fn(),
      hasChanges: true,
      draftErrors: prepareSkillDraftPatch(original, invalid).errors,
    };
    const { rerender } = render(<SkillDetailCard {...props} />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveValue(invalid.name);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Name must contain no more than 140 characters.',
    );
    expect(input).not.toHaveAttribute('maxlength');
    expect(screen.getByRole('button', { name: 'Save skill' })).toBeDisabled();
    rerender(
      <SkillDetailCard
        {...props}
        skillDraft={original}
        hasChanges={false}
        draftErrors={[]}
      />,
    );
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save skill' })).toBeDisabled();
  });
  it('allows managers to fork and edit personal definitions while disabling all controls during a mutation', () => {
    const onFork = vi.fn();
    const props = {
      customizing: false,
      savingSkill: true,
      selectedSkill: skill,
      skillDraft: original,
      onCustomize: onFork,
      onSaveSkill: vi.fn(),
      onSkillDraftChange: vi.fn(),
      hasChanges: true,
      draftErrors: [],
    };
    render(<SkillDetailCard {...props} />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fork' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    expect(onFork).not.toHaveBeenCalled();
  });
});
