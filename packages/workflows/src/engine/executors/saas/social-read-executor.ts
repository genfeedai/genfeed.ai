import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export type SocialReadMode = 'timeline' | 'mentions' | 'search';
export type SocialReadPlatform = 'twitter';

export interface SocialReadPost {
  id: string;
  text: string;
  authorUsername?: string;
  authorName?: string;
  createdAt?: string;
  url?: string;
  likes?: number;
  replies?: number;
  retweets?: number;
  engagement?: number;
}

export interface SocialReadResult {
  platform: SocialReadPlatform;
  mode: SocialReadMode;
  count: number;
  posts: SocialReadPost[];
  summary: string;
  postsJson: string;
}

export type SocialReadProvider = (params: {
  organizationId: string;
  userId: string;
  brandId?: string;
  /** Which of the brand's accounts to read as; omitted reads the default. */
  credentialId?: string;
  platform: SocialReadPlatform;
  mode: SocialReadMode;
  query?: string;
  username?: string;
  limit: number;
}) => Promise<SocialReadPost[]>;

/**
 * Social Read Executor
 *
 * Fetches recent social activity on demand for mid-graph analysis.
 * Provider is injected by the API adapter (X first via TwitterService).
 *
 * Node Type: socialRead
 */
export class SocialReadExecutor extends BaseExecutor {
  readonly nodeType = 'socialRead';
  private provider: SocialReadProvider | null = null;

  setProvider(provider: SocialReadProvider): void {
    this.provider = provider;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform ?? 'twitter';
    if (platform !== 'twitter') {
      errors.push('socialRead currently supports platform "twitter" only');
    }

    const mode = node.config.mode as string | undefined;
    if (mode && !['timeline', 'mentions', 'search'].includes(mode)) {
      errors.push('mode must be timeline, mentions, or search');
    }

    if (mode === 'search') {
      const query = String(node.config.query ?? '').trim();
      if (!query) {
        errors.push('query is required when mode is search');
      }
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.provider) {
      throw new Error('Social read provider not configured');
    }

    const platform = this.getOptionalConfig<SocialReadPlatform>(
      node.config,
      'platform',
      'twitter',
    );
    const mode = this.getOptionalConfig<SocialReadMode>(
      node.config,
      'mode',
      'timeline',
    );
    const limit = Math.min(
      Math.max(this.getOptionalConfig<number>(node.config, 'limit', 20), 1),
      50,
    );

    const query =
      (inputs.get('query') as string | undefined) ??
      this.getOptionalConfig<string>(node.config, 'query', '');
    const username =
      (inputs.get('username') as string | undefined) ??
      this.getOptionalConfig<string>(node.config, 'username', '');

    const brandFromInput = inputs.get('brand') as
      | { id?: string; brandId?: string }
      | string
      | undefined;
    const brandFromConfig = this.getOptionalConfig<string | undefined>(
      node.config,
      'brandId',
      undefined,
    );
    const brandId =
      typeof brandFromInput === 'string'
        ? brandFromInput
        : (brandFromInput?.id ?? brandFromInput?.brandId ?? brandFromConfig);
    const credentialId = this.getOptionalConfig<string | undefined>(
      node.config,
      'credentialId',
      undefined,
    );

    if (mode === 'search' && !String(query).trim()) {
      throw new Error('query is required when mode is search');
    }

    const posts = await this.provider({
      brandId,
      credentialId: String(credentialId ?? '').trim() || undefined,
      limit,
      mode,
      organizationId: context.organizationId,
      platform,
      query: String(query).trim() || undefined,
      userId: context.userId,
      username: String(username).trim() || undefined,
    });

    const summary = buildSummary(mode, posts);
    const postsJson = JSON.stringify(posts);

    const result: SocialReadResult = {
      count: posts.length,
      mode,
      platform,
      posts,
      postsJson,
      summary,
    };

    return {
      data: {
        count: result.count,
        mode: result.mode,
        platform: result.platform,
        posts: postsJson,
        postsJson: result.postsJson,
        summary: result.summary,
      },
      metadata: {
        count: result.count,
        mode,
        platform,
      },
    };
  }
}

function buildSummary(mode: SocialReadMode, posts: SocialReadPost[]): string {
  if (posts.length === 0) {
    return `No ${mode} results returned.`;
  }

  const lines = posts.slice(0, 10).map((post, index) => {
    const author = post.authorUsername ? `@${post.authorUsername}` : 'unknown';
    const text = (post.text ?? '').replace(/\s+/g, ' ').slice(0, 160);
    return `${index + 1}. ${author}: ${text}`;
  });

  return `Fetched ${posts.length} ${mode} item(s):\n${lines.join('\n')}`;
}

export function createSocialReadExecutor(
  provider: SocialReadProvider,
): SocialReadExecutor {
  const executor = new SocialReadExecutor();
  executor.setProvider(provider);
  return executor;
}
