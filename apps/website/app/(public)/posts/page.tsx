import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PostsIngredientsList from '@pages/posts/ingredients/posts-ingredients-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadataWithCanonical(
  'Posts by Ingredient',
  'Browse AI-generated content organized by ingredient. Discover how different AI models and templates produce professional marketing content.',
  '/posts',
);

export default async function PostsByIngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return (
    <>
      {/*
        The gallery below is fetched client-side, so the only text a crawler
        used to see was the container title and its one-line subtitle — 23
        words, which the 2026-08-19 site audit flagged as "Low word count".
        This intro is server-rendered and explains the route on its own.
      */}
      <section className="mx-auto w-full max-w-3xl px-4 pt-10 pb-2">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">
          Every post, grouped by the ingredient behind it
        </h2>
        <p className="mt-4 text-foreground/70">
          An ingredient is a piece of generated media — an image, a video, an
          avatar, a voice, a music bed, or a block of copy — produced in Genfeed
          and kept as a reusable asset. Once it exists, the same ingredient can
          be reworked, restyled, and republished across as many posts and
          channels as a campaign needs.
        </p>
        <p className="mt-4 text-foreground/70">
          This public gallery groups output by the ingredient that produced it,
          so you can follow a single asset through everything it became: how
          many posts it generated and how much attention those posts earned.
          Open any ingredient to browse its posts, see the models and prompts
          involved, and judge the results before you generate your own.
        </p>
      </section>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <PostsIngredientsList page={page} />
      </Suspense>
    </>
  );
}
