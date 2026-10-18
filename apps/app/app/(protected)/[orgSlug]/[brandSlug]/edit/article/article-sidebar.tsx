import { ArticleStatus, formatEnumLabel } from '@genfeedai/contracts';
import type { ArticleSidebarProps } from '@props/edit/article-sidebar.props';
import SeoScorecard from '@ui/evaluation/seo-scorecard/SeoScorecard';
import InspectorSection from '@ui/posts/post-detail-sidebar/InspectorSection';
import ArticleDeliveryCard from './article-delivery-card';
import ArticlePublicPageCard from './article-public-page-card';

export default function ArticleSidebar({
  form,
  article,
  destination,
  isDirty = false,
  isScoringSeo = false,
  onScoreSeo,
  delivery,
}: ArticleSidebarProps) {
  const isPublished = form.status === ArticleStatus.PUBLISHED;
  const facts = article
    ? [
        formatEnumLabel(form.status),
        `${article.wordCount || 0} words`,
        `${article.readingTime || 0} min read`,
        form.category,
      ]
    : [];

  return (
    <div className="space-y-4">
      {article && (
        <p
          className="text-xs capitalize text-muted-foreground"
          data-testid="article-facts"
        >
          {facts.join(' · ')}
        </p>
      )}

      {article && (
        <ArticlePublicPageCard
          article={article}
          destination={destination}
          isPublished={isPublished}
          summary={form.summary}
          title={form.label}
        />
      )}

      {article && delivery && (
        <ArticleDeliveryCard
          article={article}
          content={form.content}
          isDirty={isDirty}
          isSavingExternalUrl={delivery.isSavingExternalUrl}
          onDelivered={delivery.onDelivered}
          onSaveExternalUrl={delivery.onSaveExternalUrl}
        />
      )}

      {article && (
        <InspectorSection
          title="SEO"
          summary={
            typeof article.seoScore === 'number'
              ? `${Math.round(article.seoScore)}/100`
              : 'Not scored'
          }
          isDefaultOpen={!isPublished}
          testId="article-seo"
        >
          <SeoScorecard
            variant="embedded"
            score={article.seoScore}
            scorecard={article.seoBreakdown}
            contentTypeLabel="article"
            isScoring={isScoringSeo}
            hasUnsavedChanges={isDirty}
            onScore={onScoreSeo}
          />
        </InspectorSection>
      )}
    </div>
  );
}
