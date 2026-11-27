import {
  type HomeProofArticle,
  type HomeProofData,
  type HomeProofPost,
  loadHomeProof,
  platformLabel,
} from '@data/home-proof.data';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import Link from 'next/link';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

function ProofPost({ post }: { post: HomeProofPost }): React.ReactElement {
  const platform = platformLabel(post.platform);
  return (
    <li className="flex flex-col gap-3">
      <a
        className="group relative block aspect-[4/5] overflow-hidden bg-foreground/5"
        href={post.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Image
          alt={`${post.brandName}: ${post.label}, first picture of the ${platform} post`}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          fill
          sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
          src={`/home-proof/${post.id}`}
          unoptimized
        />
      </a>
      <div className="flex flex-col gap-1">
        <Text className="text-sm font-semibold text-foreground">
          {post.brandName}
        </Text>
        {post.caption ? (
          <Text className="line-clamp-3 text-sm leading-6 text-foreground/80">
            {post.caption}
          </Text>
        ) : null}
        <a
          className="text-sm font-semibold text-foreground underline underline-offset-4"
          href={post.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open on {platform}
          <span className="sr-only">: {post.label}</span>
        </a>
        <Text className="text-xs text-foreground/60">
          {formatDate(post.publishedAt)}
        </Text>
      </div>
    </li>
  );
}

function ProofArticle({
  article,
}: {
  article: HomeProofArticle;
}): React.ReactElement {
  return (
    <li>
      <Link
        className="group flex items-center gap-4"
        href={article.url}
        prefetch={false}
      >
        {article.coverImageUrl ? (
          <span className="relative block aspect-[3/2] w-28 shrink-0 overflow-hidden bg-foreground/5">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="112px"
              src={article.coverImageUrl}
              unoptimized
            />
          </span>
        ) : null}
        <span className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground underline-offset-4 group-hover:underline">
            {article.label}
          </span>
          <span className="text-xs text-foreground/60">
            {formatDate(article.publishedAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** What the section shows; split from the loader so it renders without the API. */
export function HomeProofView({
  articles,
  posts,
}: HomeProofData): React.ReactElement | null {
  if (!posts.length && !articles.length) {
    return null;
  }

  return (
    <section
      id="proof"
      aria-labelledby="home-proof-heading"
      className="gen-section-spacing-lg border-b border-foreground/5"
      data-testid="home-proof"
    >
      <div className="container mx-auto px-6">
        <div className="flex max-w-3xl flex-col gap-5" data-reveal="up">
          <Text className="text-xs font-semibold uppercase tracking-label text-foreground/80">
            Published with Genfeed
          </Text>
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-[0.98] tracking-[-0.02em] text-foreground sm:text-6xl"
            id="home-proof-heading"
          >
            Our own brands run on it
          </Heading>
          <Text className="max-w-2xl text-base leading-7 text-foreground/80 md:text-lg">
            These went out through Genfeed on accounts we run ourselves. Each
            one opens the live post.
          </Text>
        </div>

        {posts.length ? (
          <ul
            aria-label="Posts published with Genfeed"
            className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6"
            data-reveal="up"
          >
            {posts.map((post) => (
              <ProofPost key={post.id} post={post} />
            ))}
          </ul>
        ) : null}

        {articles.length ? (
          <div className="mt-14 flex flex-col gap-5" data-reveal="up">
            <Text className="text-sm font-semibold text-foreground">
              Latest articles, written and published with Genfeed
            </Text>
            <ul className="grid gap-6 md:grid-cols-3">
              {articles.map((article) => (
                <ProofArticle key={article.id} article={article} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Real posts and articles from our own brands; renders nothing when the API gives none. */
export default async function HomeProof(): Promise<React.ReactElement | null> {
  return <HomeProofView {...(await loadHomeProof())} />;
}
