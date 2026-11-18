import { CacheService } from '@api/services/cache/cache.service';
import {
  readTwitterBannerUrl,
  TWITTER_PROFILE_MEDIA_USER_FIELDS,
  toTwitterFullSizeAvatarUrl,
} from '@api/services/integrations/twitter/utils/twitter-profile-media.util';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const CACHE_SECONDS = 24 * 60 * 60;
const NON_SAMPLE_TEXT = /^(?:RT @|@|https?:\/\/\S+$)/i;
const postSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string().optional(),
  author_id: z.string().optional(),
  referenced_posts: z.array(z.object({ type: z.string() })).optional(),
  note_post: z.object({ text: z.string().optional() }).optional(),
});
const profileSchema = z.object({
  data: z.object({
    id: z.string().regex(/^\d+$/),
    username: z.string(),
    name: z.string(),
    description: z.string().optional(),
    protected: z.boolean().optional(),
    profile_banner_url: z.string().optional(),
    profile_image_url: z.string().optional(),
    most_recent_post_id: z.string().optional(),
  }),
  includes: z.object({ posts: z.array(postSchema).optional() }).optional(),
});
const timelineSchema = z.object({ data: z.array(postSchema).optional() });
type PublicPost = z.infer<typeof postSchema>;

function sample(post: PublicPost, userId: string) {
  const text = (post.note_post?.text || post.text).trim();
  if (
    !text ||
    NON_SAMPLE_TEXT.test(text) ||
    (post.author_id && post.author_id !== userId) ||
    post.referenced_posts?.length
  )
    return undefined;
  return { id: post.id, text, publishedAt: post.created_at ?? null };
}

@Injectable()
export class PublicXBrandSourceService {
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  private async cached<T>(
    key: string,
    load: () => Promise<T>,
  ): Promise<T | undefined> {
    const active = this.pending.get(key);
    if (active) return active as Promise<T | undefined>;
    const read = this.cache.getOrSetWithLock(
      key,
      load,
      { ttl: CACHE_SECONDS },
      10,
    );
    this.pending.set(key, read);
    try {
      return await read;
    } finally {
      this.pending.delete(key);
    }
  }

  private async read(
    path: string,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<unknown> {
    const url = new URL(path, 'https://api.x.com');
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.get('TWITTER_BEARER_TOKEN')}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(8000, Math.floor(timeoutMs))),
      ),
    });
    if (!response.ok)
      throw Object.assign(
        new Error(`Public X lookup failed (HTTP ${response.status})`),
        { status: response.status },
      );
    return response.json();
  }

  async profile(handle: string, timeoutMs = 8000) {
    if (!this.config.get('TWITTER_BEARER_TOKEN')) return undefined;
    return this.cached(`brand-setup:x:profile:v1:${handle}`, async () => {
      const result = profileSchema.parse(
        await this.read(
          `/2/users/by/username/${encodeURIComponent(handle)}`,
          {
            'user.fields': `description,protected,${TWITTER_PROFILE_MEDIA_USER_FIELDS}`,
            expansions: 'most_recent_post_id',
            'post.fields': 'created_at,note_post',
          },
          timeoutMs,
        ),
      );
      const user = result.data;
      const posts = result.includes?.posts ?? [];
      const latest = user.protected
        ? undefined
        : user.most_recent_post_id
          ? posts.find((post) => post.id === user.most_recent_post_id)
          : posts.length === 1
            ? posts[0]
            : undefined;
      return {
        id: user.id,
        handle: user.username,
        name: user.name,
        bio: user.description,
        avatar: toTwitterFullSizeAvatarUrl(user.profile_image_url),
        banner: readTwitterBannerUrl(user),
        protected: user.protected === true,
        latestText: latest?.note_post?.text ?? latest?.text,
        latestSample: latest && sample(latest, user.id),
        readAt: new Date().toISOString(),
      };
    });
  }

  async voiceSamples(handle: string) {
    const profile = await this.profile(handle);
    if (!profile || profile.protected) return [];
    if (profile.latestSample) return [profile.latestSample];
    const posts = await this.cached(
      `brand-setup:x:voice:v1:${profile.id}`,
      async () => {
        const timeline = timelineSchema.parse(
          await this.read(
            `/2/users/${profile.id}/tweets`,
            {
              max_results: '5',
              exclude: 'replies,retweets',
              'post.fields': 'created_at,note_post',
            },
            8000,
          ),
        );
        return (timeline.data ?? [])
          .slice(0, 5)
          .flatMap((post) => sample(post, profile.id) ?? []);
      },
    );
    return posts ?? [];
  }
}
