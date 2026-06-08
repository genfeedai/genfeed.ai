'use client';

import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';
import Card from '@ui/card/Card';
import ContentPreviewSidebar from '@ui/preview/ContentPreviewSidebar';

type ArticleSidebarProps = {
  form: Pick<
    ArticleFormState,
    'label' | 'summary' | 'content' | 'status' | 'category'
  >;
  article: Article | null;
};

export default function ArticleSidebar({ form, article }: ArticleSidebarProps) {
  return (
    <div className="space-y-4">
      <ContentPreviewSidebar
        title={form.label}
        subtitle={form.summary}
        content={form.content}
        platform="article"
      />

      {/* Article stats */}
      {article && (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
            Article Info
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground/60">Status</span>
              <span className="font-medium capitalize">{form.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Words</span>
              <span className="font-medium">{article.wordCount || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Reading time</span>
              <span className="font-medium">
                {article.readingTime || 0} min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Category</span>
              <span className="font-medium capitalize">{form.category}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
