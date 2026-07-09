import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PostStatus } from '@genfeedai/enums';
import {
  HookGeneratorExecutor,
  PromptConstructorExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflow-engine';

const POST_GEN_MODEL = 'openai/gpt-4o-mini';
const POST_GEN_TEMPERATURE = 0.6;

export class WorkflowContentExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly postsService?: PostsService,
    private readonly credentialsService?: CredentialsService,
    private readonly newslettersService?: NewslettersService,
    private readonly openRouterService?: OpenRouterService,
    private readonly sourcePostsService?: SourcePostsService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerPromptConstructorExecutor(engine);
    this.registerHookGeneratorExecutor(engine);
    this.registerLlmExecutor(engine);
    this.registerSourceCorpusExecutor(engine);
    this.registerPostExecutor(engine);
    this.registerNewsletterExecutor(engine);
    this.registerAttachPostIngredientExecutor(engine);
  }

  private registerPromptConstructorExecutor(engine: WorkflowEngine): void {
    const promptConstructorExecutor = new PromptConstructorExecutor();
    engine.registerExecutor(
      'promptConstructor',
      this.helper.wrapEngineExecutor(promptConstructorExecutor),
    );
  }

  private registerHookGeneratorExecutor(engine: WorkflowEngine): void {
    const hookGeneratorExecutor = new HookGeneratorExecutor();
    engine.registerExecutor(
      'hookGenerator',
      this.helper.wrapEngineExecutor(hookGeneratorExecutor),
    );
  }

  private registerLlmExecutor(engine: WorkflowEngine): void {
    const openRouterService = this.openRouterService;

    engine.registerExecutor('llm', async (node, inputs) => {
      if (!openRouterService) {
        throw new Error('OpenRouter service is not available for llm nodes');
      }

      const prompt =
        readTextInput(inputs, ['prompt', 'content', 'text']) ??
        this.helper.readConfigString(node.config, 'prompt');

      if (!prompt) {
        throw new Error('Missing required input: prompt');
      }

      const response = await openRouterService.chatCompletion({
        max_tokens: Math.round(
          this.helper.getOptionalNumberConfig(node.config, 'maxTokens', 1024),
        ),
        messages: [{ content: prompt, role: 'user' }],
        model:
          this.helper.readConfigString(node.config, 'model') ??
          'openai/gpt-4o-mini',
        temperature: this.helper.getOptionalNumberConfig(
          node.config,
          'temperature',
          0.8,
        ),
      });
      const content = response.choices[0]?.message?.content?.trim() ?? '';

      if (!content) {
        throw new Error('LLM executor returned empty content');
      }

      return { content, model: response.model, text: content };
    });
  }

  private registerPostExecutor(engine: WorkflowEngine): void {
    const postsService = this.postsService;
    const credentialsService = this.credentialsService;
    const openRouterService = this.openRouterService;

    if (!postsService || !credentialsService || !openRouterService) {
      return;
    }

    engine.registerExecutor('postGen', async (node, inputs, context) => {
      const brandId = this.helper.readConfigString(node.config, 'brandId');
      const prompt =
        readTextInput(inputs, ['prompt', 'content', 'text']) ??
        this.helper.readConfigString(node.config, 'prompt');

      if (!brandId || !prompt) {
        throw new Error('postGen requires brandId and prompt');
      }

      const credentialId = this.helper.readConfigString(
        node.config,
        'credentialId',
      );
      const brandLabel =
        this.helper.readConfigString(node.config, 'brandLabel') ?? 'the brand';
      const timezone =
        this.helper.readConfigString(node.config, 'timezone') ?? 'UTC';

      const credentialQuery: Record<string, unknown> = {
        brand: brandId,
        isConnected: true,
        isDeleted: false,
        organization: context.organizationId,
      };

      if (credentialId) {
        credentialQuery._id = credentialId;
      }

      const credential = await credentialsService.findOne(credentialQuery);
      if (!credential) {
        return {
          reason: 'missing_connected_credential',
          status: 'skipped',
        };
      }

      const completion = await openRouterService.chatCompletion({
        max_tokens: 500,
        messages: buildPostGenMessages(brandLabel, prompt),
        model: POST_GEN_MODEL,
        temperature: POST_GEN_TEMPERATURE,
      });

      const description =
        completion.choices?.[0]?.message?.content?.trim() ??
        `Daily post draft for ${brandLabel}`;

      const post = await (
        postsService.prisma as unknown as {
          post: {
            create(args: Record<string, unknown>): Promise<{
              description: string;
              id: string;
              label?: string | null;
              platform: string;
              status: string;
            }>;
          };
        }
      ).post.create({
        data: {
          brandId,
          category: 'TEXT',
          credentialId: credential.id,
          description,
          label: this.helper.buildPostLabel(description),
          organizationId: context.organizationId,
          platform: String(credential.platform).toLowerCase(),
          source: 'workflow-post-generator',
          status: PostStatus.DRAFT,
          timezone,
          userId: context.userId,
        },
      });

      return {
        description: post.description,
        id: post.id.toString(),
        platform: post.platform,
        post: {
          id: post.id.toString(),
          label: post.label,
          status: post.status,
        },
        status: post.status,
      };
    });
  }

  private registerNewsletterExecutor(engine: WorkflowEngine): void {
    const newslettersService = this.newslettersService;

    if (!newslettersService) {
      return;
    }

    engine.registerExecutor('newsletterGen', async (node, inputs, context) => {
      const brandId = this.helper.readConfigString(node.config, 'brandId');
      const prompt =
        readTextInput(inputs, ['prompt', 'content', 'text']) ??
        this.helper.readConfigString(node.config, 'prompt');

      if (!brandId || !prompt) {
        throw new Error('newsletterGen requires brandId and prompt');
      }

      const instructions = this.helper.readConfigString(
        node.config,
        'instructions',
      );
      const newsletter = await newslettersService.generateDraft(
        {
          instructions,
          topic: prompt,
        },
        {
          brandId,
          organizationId: context.organizationId,
          userId: context.userId,
        },
      );

      return {
        id: newsletter.id.toString(),
        newsletter: {
          id: newsletter.id.toString(),
          label: newsletter.label,
          status: newsletter.status,
          topic: newsletter.topic,
        },
        status: newsletter.status,
        topic: newsletter.topic,
      };
    });
  }

  private registerSourceCorpusExecutor(engine: WorkflowEngine): void {
    const sourcePostsService = this.sourcePostsService;

    if (!sourcePostsService) {
      return;
    }

    engine.registerExecutor('sourceCorpus', async (node, _inputs, context) => {
      const brandId = this.helper.readConfigString(node.config, 'brandId');

      if (!brandId) {
        throw new Error('sourceCorpus requires brandId');
      }

      const days = Math.round(
        this.helper.getOptionalNumberConfig(node.config, 'days', 7),
      );
      const limit = Math.round(
        this.helper.getOptionalNumberConfig(node.config, 'limit', 50),
      );
      const result = await sourcePostsService.getWeeklyCorpus(
        context.organizationId,
        brandId,
        days,
        limit,
      );

      return {
        content: result.corpus,
        corpus: result.corpus,
        count: result.count,
        markdown: result.corpus,
        posts: result.posts,
        text: result.corpus,
      };
    });
  }

  private registerAttachPostIngredientExecutor(engine: WorkflowEngine): void {
    const sourcePostsService = this.sourcePostsService;

    if (!sourcePostsService) {
      return;
    }

    engine.registerExecutor(
      'attachPostIngredient',
      async (node, inputs, context) => {
        const brandId = this.helper.readConfigString(node.config, 'brandId');
        const postId =
          readIdInput(inputs.get('postId')) ??
          this.helper.readConfigString(node.config, 'postId');
        const ingredientId =
          readIdInput(inputs.get('ingredientId')) ??
          readIdInput(inputs.get('image')) ??
          this.helper.readConfigString(node.config, 'ingredientId');

        if (!brandId || !postId || !ingredientId) {
          throw new Error(
            'attachPostIngredient requires brandId, postId, and ingredientId',
          );
        }

        return sourcePostsService.attachIngredientToPost(postId, ingredientId, {
          brandId,
          organizationId: context.organizationId,
        });
      },
    );
  }
}

function buildPostGenMessages(brandLabel: string, prompt: string) {
  return [
    {
      content:
        'You write concise, production-ready social media drafts. Return only the post body with no preamble.',
      role: 'system' as const,
    },
    {
      content: [
        `Brand: ${brandLabel}`,
        `Prompt: ${prompt}`,
        'Write one clear social post draft that is specific and ready for review.',
      ].join('\n\n'),
      role: 'user' as const,
    },
  ];
}

function readTextInput(
  inputs: Map<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = stringifyWorkflowInput(inputs.get(key));
    if (value) {
      return value;
    }
  }
  return undefined;
}

function stringifyWorkflowInput(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['prompt', 'text', 'content', 'corpus', 'description']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function readIdInput(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = record.id ?? record.ingredientId ?? record.postId;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}
