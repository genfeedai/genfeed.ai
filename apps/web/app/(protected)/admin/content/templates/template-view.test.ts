import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { describe, expect, it } from 'vitest';
import { toTemplateView } from './template-view';

function template(partial: Partial<IContentTemplate>): IContentTemplate {
  return { id: 't-1', ...partial } as IContentTemplate;
}

describe('toTemplateView', () => {
  it('reads the API shape: label, string content and a missing organization', () => {
    expect(
      toTemplateView(
        template({
          content: '{{{prompt}}}' as never,
          key: 'content.video.default',
          label: 'Video default',
          variables: [{ name: 'prompt' }] as never,
        }),
      ),
    ).toMatchObject({
      body: '{{{prompt}}}',
      isSystem: true,
      key: 'content.video.default',
      title: 'Video default',
      variableNames: ['prompt'],
    });
  });

  it('reads the legacy shape and marks an organization template as not system', () => {
    expect(
      toTemplateView(
        template({
          content: { prompt: 'Hi' },
          name: 'Legacy',
          organization: 'org-1',
        }),
      ),
    ).toMatchObject({ body: 'Hi', isSystem: false, title: 'Legacy' });
  });

  it('treats a null isActive as unknown, not inactive', () => {
    expect(
      toTemplateView(template({ isActive: null as never })).isActive,
    ).toBeUndefined();
    expect(toTemplateView(template({ isActive: false })).isActive).toBe(false);
  });

  it('survives a template with null variables and tags', () => {
    expect(
      toTemplateView(
        template({ tags: null as never, variables: null as never }),
      ),
    ).toMatchObject({ tags: [], title: 't-1', variableNames: [] });
  });
});
