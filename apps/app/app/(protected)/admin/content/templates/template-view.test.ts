import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { describe, expect, it } from 'vitest';
import { matchesTemplateSearch, toTemplateView } from './template-view';

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

  it('survives a template with null variables and tags', () => {
    expect(
      toTemplateView(
        template({ tags: null as never, variables: null as never }),
      ),
    ).toMatchObject({ tags: [], title: 't-1', variableNames: [] });
  });
});

describe('matchesTemplateSearch', () => {
  const view = toTemplateView(
    template({ key: 'content.image.default', label: 'Image default' }),
  );

  it('matches title or key case-insensitively and ignores blank queries', () => {
    expect(matchesTemplateSearch(view, 'IMAGE')).toBe(true);
    expect(matchesTemplateSearch(view, 'content.image')).toBe(true);
    expect(matchesTemplateSearch(view, '  ')).toBe(true);
    expect(matchesTemplateSearch(view, 'video')).toBe(false);
  });
});
