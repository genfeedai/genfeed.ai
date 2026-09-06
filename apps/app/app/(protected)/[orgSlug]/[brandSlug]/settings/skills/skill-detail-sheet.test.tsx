// @vitest-environment jsdom
'use client';

import type { Skill } from '@services/content/skills.service';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SkillDetailSheet from './skill-detail-sheet';

const selectedSkillFixture: Skill = {
  channels: ['youtube'],
  defaultInstructions: 'Base instructions',
  description: 'Sets up long-form creator scripts.',
  id: 'skill-1',
  isBuiltIn: true,
  isEnabled: true,
  modalities: ['text'],
  name: 'YouTube Script Setup',
  organization: null,
  requiredProviders: ['openai'],
  slug: 'youtube-script-setup',
  source: 'built_in',
  status: 'published',
  workflowStage: 'creation',
} as Skill;

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

describe('SkillDetailSheet', () => {
  it('renders the selected skill detail content when open', () => {
    render(
      <SkillDetailSheet
        customizing={false}
        isOpen
        onCustomize={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenTestInChat={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={selectedSkillFixture}
        skillDraft={{
          defaultInstructions: 'Base instructions',
          description: 'Sets up long-form creator scripts.',
          name: 'YouTube Script Setup',
          systemPromptTemplate: '',
        }}
      />,
    );

    expect(screen.getAllByText('YouTube Script Setup')[0]).toBeVisible();
    expect(
      screen.getByRole('button', { name: /test with agent/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing selected state when no skill is provided', () => {
    render(
      <SkillDetailSheet
        customizing={false}
        isOpen
        onCustomize={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenTestInChat={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={null}
        skillDraft={{
          defaultInstructions: '',
          description: '',
          name: '',
          systemPromptTemplate: '',
        }}
      />,
    );

    expect(
      screen.getByText(/select a skill from the catalog/i),
    ).toBeInTheDocument();
  });

  it('calls onOpenChange when the sheet is closed', () => {
    const onOpenChange = vi.fn();
    render(
      <SkillDetailSheet
        customizing={false}
        isOpen
        onCustomize={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenTestInChat={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={selectedSkillFixture}
        skillDraft={{
          defaultInstructions: '',
          description: '',
          name: '',
          systemPromptTemplate: '',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
