// @vitest-environment jsdom
'use client';

import type { Skill } from '@services/content/skills.service';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SkillsTable from './skills-table';

const skillsFixture: Skill[] = [
  {
    channels: ['youtube', 'linkedin'],
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
  } as Skill,
];

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

describe('SkillsTable', () => {
  it('renders skill rows with source, modality and stage badges', () => {
    render(
      <SkillsTable
        enabledSlugs={['youtube-script-setup']}
        isLoading={false}
        isTogglingSkill={false}
        onSkillSelect={vi.fn()}
        onToggleSkill={vi.fn()}
        skills={skillsFixture}
      />,
    );

    expect(screen.getByText('YouTube Script Setup')).toBeVisible();
    expect(screen.getByText(/built in/i)).toBeInTheDocument();
    expect(screen.getByText('creation')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Enable YouTube Script Setup' }),
    ).toBeChecked();
  });

  it('calls onSkillSelect when a row is clicked', () => {
    const onSkillSelect = vi.fn();
    render(
      <SkillsTable
        enabledSlugs={[]}
        isLoading={false}
        isTogglingSkill={false}
        onSkillSelect={onSkillSelect}
        onToggleSkill={vi.fn()}
        skills={skillsFixture}
      />,
    );

    fireEvent.click(screen.getByText('YouTube Script Setup'));

    expect(onSkillSelect).toHaveBeenCalledWith('skill-1');
  });

  it('calls onToggleSkill without triggering row selection', () => {
    const onSkillSelect = vi.fn();
    const onToggleSkill = vi.fn();
    render(
      <SkillsTable
        enabledSlugs={[]}
        isLoading={false}
        isTogglingSkill={false}
        onSkillSelect={onSkillSelect}
        onToggleSkill={onToggleSkill}
        skills={skillsFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable YouTube Script Setup' }),
    );

    expect(onToggleSkill).toHaveBeenCalledWith('youtube-script-setup');
    expect(onSkillSelect).not.toHaveBeenCalled();
  });
});
