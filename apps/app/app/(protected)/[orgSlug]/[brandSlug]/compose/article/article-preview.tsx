'use client';

import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';
import XArticleSectionCard from '@ui/articles/x-article/XArticleSectionCard';
import Card from '@ui/card/Card';
import HtmlContent from '@ui/display/html-content/HtmlContent';

type ArticlePreviewProps = {
  form: Pick<ArticleFormState, 'label' | 'summary' | 'content'>;
  hasXArticleSections: boolean;
  article: Article | null;
  onCopySection: (sectionId: string) => void;
};

export default function ArticlePreview({
  form,
  hasXArticleSections,
  article,
  onCopySection,
}: ArticlePreviewProps) {
  return (
    <>
      <Card className="p-6">
        <article className="prose prose-sm sm:prose lg:prose-lg max-w-none">
          <h1>{form.label || 'Untitled Article'}</h1>
          {form.summary && (
            <p className="text-lg text-foreground/70 italic">{form.summary}</p>
          )}
          {!hasXArticleSections && <HtmlContent content={form.content || ''} />}
        </article>
      </Card>

      {/* X Article section cards in preview */}
      {hasXArticleSections &&
        article?.xArticleMetadata?.sections.map((section) => (
          <XArticleSectionCard
            key={section.id}
            section={section}
            onCopy={onCopySection}
          />
        ))}
    </>
  );
}
