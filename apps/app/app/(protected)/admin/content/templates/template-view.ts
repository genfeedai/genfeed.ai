import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import type { TemplateView } from '@props/admin/templates.props';

/**
 * The API serializes a template as `label` + string `content` (Handlebars for
 * prompt templates); the older UI shape used `name` + `content.prompt`. Read
 * either so a template renders whichever way it was written.
 */
export function toTemplateView(template: IContentTemplate): TemplateView {
  const content: unknown = template.content;
  const body =
    typeof content === 'string'
      ? content
      : (content as { prompt?: string } | null | undefined)?.prompt;

  return {
    body,
    category: template.category ?? undefined,
    description: template.description || undefined,
    id: template.id,
    // Rows imported without the flag carry null, which is unknown, not inactive.
    isActive: template.isActive ?? undefined,
    isSystem: !template.organization && !template.organizationId,
    key: template.key,
    tags: template.tags ?? [],
    title: template.label ?? template.name ?? template.key ?? template.id,
    variableNames: (template.variables ?? []).map(
      (variable) => variable.name ?? variable.id,
    ),
  };
}
