import type { Ingredient } from '@models/content/ingredient.model';
import type { PublicListPageProps } from '@props/website/public-list-page.props';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import PublicListPage from '@web-components/content/PublicListPage';
import { Eye, FileText, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

// The public gallery: ingredients with the posts made from them. The page
// fetches on the server, so the grid is in the HTML and ships no client code.

type IngredientWithMetrics = Ingredient & {
  totalPosts?: number;
  totalViews?: number;
};

interface PostsIngredientsListProps {
  ingredients: IngredientWithMetrics[];
  pagination?: PublicListPageProps['pagination'];
}

export default function PostsIngredientsList({
  ingredients,
  pagination,
}: PostsIngredientsListProps) {
  return (
    <PublicListPage
      description="Content organized by ingredient."
      icon={ImageIcon}
      label="Posts by Ingredient"
      pagination={pagination}
      totalLabel="ingredients"
    >
      {ingredients.length === 0 ? (
        <CardEmpty label="No ingredients available" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {ingredients.map((ingredient) => {
            return (
              <Link
                key={ingredient.id}
                href={`/posts/${ingredient.id}`}
                className="block"
              >
                <Card className="p-0 hover:shadow-lg transition-shadow duration-300 overflow-hidden group">
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-square bg-background overflow-hidden">
                    {ingredient.thumbnailUrl ? (
                      <Image
                        src={ingredient.thumbnailUrl}
                        alt={ingredient.metadataLabel || 'Ingredient thumbnail'}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="text-6xl text-foreground/20" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold truncate text-base mb-2">
                      {ingredient.metadataLabel || 'Untitled'}
                    </h3>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 text-sm text-foreground/60">
                      <div className="flex items-center gap-2">
                        <FileText className="text-base" />
                        <span>{ingredient.totalPosts || 0} posts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Eye className="text-base" />
                        <span>{ingredient.totalViews || 0} views</span>
                      </div>
                    </div>

                    {/* Category badge */}
                    {ingredient.category && (
                      <div className="mt-3">
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary capitalize">
                          {ingredient.category}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PublicListPage>
  );
}
