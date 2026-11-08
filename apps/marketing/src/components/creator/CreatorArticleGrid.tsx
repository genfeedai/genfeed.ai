import type { CreatorArticleGridProps } from '@props/content/creator.props';
import CreatorArticleCard from './CreatorArticleCard';

export default function CreatorArticleGrid({
  articles,
  handle,
  isBylineVisible = false,
}: CreatorArticleGridProps): React.ReactElement | null {
  if (articles.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {articles.map((article) => (
        <li key={article.id}>
          <CreatorArticleCard
            article={article}
            handle={handle}
            isBylineVisible={isBylineVisible}
          />
        </li>
      ))}
    </ul>
  );
}
