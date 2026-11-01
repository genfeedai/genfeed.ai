import type { Skill } from '@services/content/skills.service';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import type { SkillsTableProps } from '@/features/settings/props/skills.props';

function getSourceBadgeVariant(
  source: Skill['source'],
): 'default' | 'outline' | 'secondary' {
  switch (source) {
    case 'custom':
    case 'customized':
      return 'default';
    case 'imported':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getModalityBadgeVariant(
  modality: string,
): 'warning' | 'secondary' | 'info' | 'default' | 'success' | 'default' {
  switch (modality) {
    case 'audio':
      return 'warning';
    case 'image':
      return 'info';
    case 'multi':
      return 'default';
    case 'text':
      return 'success';
    case 'video':
      return 'default';
    default:
      return 'secondary';
  }
}

export default function SkillsTable({
  enabledSlugs,
  isLoading,
  pendingSlugs,
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
              <div className="mt-0.5 line-clamp-1 text-xs text-foreground/60">
                {skill.description}
              </div>
            </div>
          ),
        },
        {
          header: translate('table.source'),
          key: 'source',
          render: (skill) => (
            <Badge variant={getSourceBadgeVariant(skill.source)}>
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
            <Badge variant="secondary">{skill.workflowStage}</Badge>
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
              isDisabled={pendingSlugs.has(skill.slug)}
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
