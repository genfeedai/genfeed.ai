'use client';

import { formatEnumLabel } from '@genfeedai/enums';
import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';
import Card from '@ui/card/Card';
import SeoScorecard from '@ui/evaluation/seo-scorecard/SeoScorecard';

type ArticleSidebarProps = {
  form: Pick<ArticleFormState, 'status' | 'category'>;
  article: Article | null;
  isDirty?: boolean;
  isScoringSeo?: boolean;
  onScoreSeo?: () => void | Promise<void>;
};

export default function ArticleSidebar({
  form,
  article,
  isDirty = false,
  isScoringSeo = false,
  onScoreSeo,
}: ArticleSidebarProps) {
  return (
    <div className="space-y-4">
      {article && (
        <SeoScorecard
          score={article.seoScore}
          scorecard={article.seoBreakdown}
          contentTypeLabel="article"
          isScoring={isScoringSeo}
          hasUnsavedChanges={isDirty}
          onScore={onScoreSeo}
        />
      )}

      {/* Article stats */}
      {article && (
        <Card bodyClassName="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
            Article Info
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground/60">Status</span>
              <span className="font-medium">
                {formatEnumLabel(form.status)}
              </span>
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
