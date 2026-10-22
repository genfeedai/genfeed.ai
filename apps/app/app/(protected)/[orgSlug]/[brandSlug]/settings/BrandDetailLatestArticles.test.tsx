import {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
  TrendNotificationFrequency,
} from '@genfeedai/contracts';
import type {
  IArticle,
  IOrganization,
  IUser,
} from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { ImageProps } from 'next/image';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetailLatestArticles from './BrandDetailLatestArticles';

const navigation = vi.hoisted(() => ({
  scope: '/acme/moonrise',
  app: 'https://app.example.test',
  website: 'https://www.example.test',
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `${navigation.scope}${path}` }),
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apps() {
      return { app: navigation.app, website: navigation.website };
    },
  },
}));
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, className }: ImageProps) => (
    // biome-ignore lint/performance/noImgElement: Test boundary exposes the original Next Image props.
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  ),
}));

const entity = {
  id: 'entity-1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  isDeleted: false,
};
const user: IUser = {
  ...entity,
  handle: 'writer',
  firstName: 'Brand',
  lastName: 'Writer',
  email: 'writer@example.test',
  settings: {
    ...entity,
    theme: 'system',
    isVerified: true,
    isFirstLogin: false,
    isMenuCollapsed: false,
    isAdvancedMode: false,
    isTrendNotificationsInApp: false,
    isTrendNotificationsTelegram: false,
    isTrendNotificationsEmail: false,
    isVideoNotificationsEmail: false,
    trendNotificationsFrequency: TrendNotificationFrequency.DAILY,
    trendNotificationsMinViralScore: 0,
  },
};
const organization: IOrganization = {
  ...entity,
  user,
  label: 'Acme',
  isSelected: true,
  settings: {
    ...entity,
    isWhitelabelEnabled: false,
    isVoiceControlEnabled: false,
    isNotificationsDiscordEnabled: false,
    isNotificationsTelegramEnabled: false,
    isNotificationsEmailEnabled: false,
    isWatermarkEnabled: false,
    isVerifyScriptEnabled: false,
    isVerifyIngredientEnabled: false,
    isVerifyVideoEnabled: false,
    isGenerateVideosEnabled: false,
    isGenerateArticlesEnabled: false,
    isGenerateImagesEnabled: false,
    isGenerateMusicEnabled: false,
    isAutoEvaluateEnabled: false,
    isFleetNsfwVisible: false,
    isWebhookEnabled: false,
    seatsLimit: 1,
    brandsLimit: 1,
  },
};
function makeArticle(id: string, overrides: Partial<IArticle> = {}): IArticle {
  return {
    ...entity,
    id,
    label: `Article ${id}`,
    slug: `article-${id}`,
    summary: '',
    content: '',
    category: ArticleCategory.ARTICLE,
    status: ArticleStatus.DRAFT,
    scope: AssetScope.BRAND,
    user,
    organization,
    ...overrides,
  };
}

beforeEach(() => {
  navigation.scope = '/acme/moonrise';
  navigation.app = 'https://app.example.test';
  navigation.website = 'https://www.example.test';
});

describe('BrandDetailLatestArticles', () => {
  const emptyCases = [
    ['empty', <BrandDetailLatestArticles key="empty" articles={[]} />],
    [
      'undefined',
      // @ts-expect-error Defensive runtime contract: transport may omit the required array.
      <BrandDetailLatestArticles key="undefined" articles={undefined} />,
    ],
    // @ts-expect-error Defensive runtime contract: transport may return null.
    ['null', <BrandDetailLatestArticles key="null" articles={null} />],
  ] as const;

  it.each(emptyCases)(
    'preserves guidance and exact navigation for %s input',
    (_state, element) => {
      render(element);
      expect(
        screen.getByRole('heading', { name: 'Latest Articles' }),
      ).toBeVisible();
      const title = screen.getByText('No articles yet');
      expect(title.tagName).toBe('P');
      expect(title).toHaveClass('text-sm font-medium text-foreground/70');
      expect(title.parentElement).toHaveClass(
        'flex flex-col items-center justify-center gap-1 px-4 py-8 text-center',
      );
      const description = screen.getByText(
        'Draft an article for this brand to populate this strip.',
      );
      expect(description.tagName).toBe('P');
      expect(description).toHaveClass(
        'max-w-xs text-xs leading-5 text-muted-foreground',
      );
      expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
        'href',
        '/acme/moonrise/publishing/posts?type=article',
      );
      expect(
        screen.getByRole('link', { name: 'Create an article' }),
      ).toHaveAttribute(
        'href',
        'https://app.example.test/acme/moonrise/agent/new?prompt=Help+me+write+a+new+long-form+article+for+my+brand.',
      );
      expect(
        screen.queryByRole('link', { name: 'Read article' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    },
  );

  it('keeps three articles in order with optional covers, summaries and external reading links', () => {
    const articles = [
      makeArticle('2', {
        coverImageUrl: 'https://media.example.test/cover.jpg',
        summary: 'First summary',
      }),
      makeArticle('1'),
      makeArticle('3', {
        label: '',
        coverImageUrl: 'https://media.example.test/fallback.jpg',
      }),
    ];
    render(<BrandDetailLatestArticles articles={articles} />);
    const grid = screen.getByText('Article 2').closest('.grid');
    expect(grid).toHaveClass('grid grid-cols-1 gap-3 sm:grid-cols-3');
    expect(grid?.children).toHaveLength(3);
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((node) => node.textContent),
    ).toEqual(['Latest Articles', 'Article 2', 'Article 1', '']);
    for (const tile of grid?.children ?? []) {
      expect(tile).toHaveClass(
        'flex flex-col overflow-hidden rounded-lg border border-border/50',
      );
      expect(tile.lastElementChild).toHaveClass('flex flex-1 flex-col p-3');
      expect(tile.querySelector('h3')).toHaveClass(
        'line-clamp-2 text-sm font-semibold',
      );
    }
    const covers = screen.getAllByRole('img');
    expect(covers).toHaveLength(2);
    expect(covers[0]).toHaveAttribute('alt', 'Article 2');
    expect(covers[0]).toHaveAttribute(
      'src',
      'https://media.example.test/cover.jpg',
    );
    expect(covers[1]).toHaveAttribute('alt', 'Article');
    for (const cover of covers) {
      expect(cover).toHaveAttribute('width', '800');
      expect(cover).toHaveAttribute('height', '400');
      expect(cover).toHaveClass('size-full object-cover outline-media');
      expect(cover.parentElement).toHaveClass('relative aspect-video w-full');
    }
    expect(grid?.children[1].querySelector('img')).toBeNull();
    expect(grid?.children[1].querySelector('p')).toBeNull();
    expect(grid?.children[2].querySelector('p')).toBeNull();
    expect(screen.getByText('First summary')).toHaveClass(
      'mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground',
    );
    const links = screen.getAllByRole('link', { name: 'Read article' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.example.test/articles/article-2',
      'https://www.example.test/articles/article-1',
      'https://www.example.test/articles/article-3',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveClass('mt-auto self-start h-8 bg-tertiary');
    }
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/acme/moonrise/publishing/posts?type=article',
    );
    expect(screen.queryByText('No articles yet')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Draft an article for this brand to populate this strip.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create an article' }),
    ).not.toBeInTheDocument();
  });

  it('resolves changed scope and both origins on rerender', () => {
    const { rerender } = render(<BrandDetailLatestArticles articles={[]} />);
    navigation.scope = '/other/brand';
    navigation.app = 'https://other-app.example.test';
    navigation.website = 'https://other-www.example.test';
    rerender(<BrandDetailLatestArticles articles={[]} />);
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/other/brand/publishing/posts?type=article',
    );
    expect(
      screen.getByRole('link', { name: 'Create an article' }),
    ).toHaveAttribute(
      'href',
      'https://other-app.example.test/other/brand/agent/new?prompt=Help+me+write+a+new+long-form+article+for+my+brand.',
    );
    rerender(<BrandDetailLatestArticles articles={[makeArticle('1')]} />);
    expect(screen.getByRole('link', { name: 'Read article' })).toHaveAttribute(
      'href',
      'https://other-www.example.test/articles/article-1',
    );
  });
});
