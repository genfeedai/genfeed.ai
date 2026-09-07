import type { SkillsTableProps } from '@props/settings/skills.props';
import type { Skill } from '@services/content/skills.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';

function getSourceBadgeVariant(
  source: Skill['source'],
): 'accent' | 'outline' | 'secondary' {
  switch (source) {
    case 'custom':
    case 'customized':
      return 'accent';
    case 'imported':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getModalityBadgeVariant(
  modality: string,
): 'audio' | 'ghost' | 'image' | 'multimodal' | 'text' | 'video' {
  switch (modality) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'multi':
      return 'multimodal';
    case 'text':
      return 'text';
    case 'video':
      return 'video';
    default:
      return 'ghost';
  }
}

export default function SkillsTable({
  enabledSlugs,
  isLoading,
  isTogglingSkill,
  onSkillSelect,
  onToggleSkill,
  skills,
}: SkillsTableProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <AppTable<Skill>
      ariaLabel={translate('catalog.title')}
      columns={[
        {
          header: translate('table.name'),
          key: 'name',
          render: (skill) => (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {skill.name}
              </div>
              <div className="mt-0.5 line-clamp-1 text-xs text-foreground/55">
                {skill.description}
              </div>
            </div>
          ),
        },
        {
          header: translate('table.source'),
          key: 'source',
          render: (skill) => (
            <Badge
              className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
              variant={getSourceBadgeVariant(skill.source)}
            >
              {skill.source.replace('_', ' ')}
            </Badge>
          ),
        },
        {
          header: translate('table.modality'),
          key: 'modalities',
          render: (skill) => (
            <div className="flex flex-wrap gap-1.5">
              {skill.modalities.map((modality) => (
                <Badge
                  className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                  key={`${skill.id}-${modality}`}
                  variant={getModalityBadgeVariant(modality)}
                >
                  {modality}
                </Badge>
              ))}
            </div>
          ),
        },
        {
          header: translate('table.stage'),
          key: 'workflowStage',
          render: (skill) => (
            <Badge
              className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
              variant="ghost"
            >
              {skill.workflowStage}
            </Badge>
          ),
        },
        {
          className: 'w-16',
          header: translate('table.enabled'),
          key: 'enabled',
          render: (skill) => (
            <Switch
              aria-label={translate('catalog.enableSkill', {
                name: skill.name,
              })}
              checked={enabledSlugs.includes(skill.slug)}
              isDisabled={isTogglingSkill}
              onCheckedChange={() => onToggleSkill(skill.slug)}
            />
          ),
        },
      ]}
      emptyLabel={translate('catalog.empty')}
      getRowKey={(skill) => skill.id}
      isLoading={isLoading}
      items={skills}
      onRowClick={(skill) => onSkillSelect(skill.id)}
    />
  );
}
