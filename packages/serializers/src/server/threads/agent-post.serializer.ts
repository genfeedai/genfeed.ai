import {
  fromPrismaCredentialPlatform,
  IngredientCategory,
  parsePlatform,
} from '@genfeedai/contracts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function publicText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function httpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ''));
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The failure a failed target carries: a stable code and a readable message only. */
function targetFailure(
  post: Record<string, unknown>,
): { code: string | null; message: string } | undefined {
  if (post.targetExecutionState !== 'failed') return undefined;
  const error = record(post.targetError);
  const message = publicText(error.message);
  return message
    ? { code: publicText(error.code) ?? null, message }
    : undefined;
}

/** Public post preview identity; credentials and storage keys never cross this boundary. */
export function serializeAgentPost(
  post: Record<string, unknown>,
): Record<string, unknown> {
  const credential = record(post.credential);
  const platform = publicText(credential.platform);
  const isAccount =
    Boolean(parsePlatform(post.platform)) &&
    credential.id === post.credentialId &&
    credential.organizationId === post.organizationId &&
    typeof post.organizationId === 'string' &&
    credential.isDeleted === false &&
    (!post.brandId ||
      !credential.brandId ||
      post.brandId === credential.brandId) &&
    (fromPrismaCredentialPlatform(platform ?? '') ??
      parsePlatform(platform)) === parsePlatform(post.platform);
  const media = Array.isArray(post.ingredients)
    ? post.ingredients.flatMap((value, order) => {
        const item = record(value);
        const assetId = publicText(item.id);
        if (
          !assetId ||
          item.isDeleted === true ||
          (item.organizationId && item.organizationId !== post.organizationId)
        )
          return [];
        const category = String(item.category ?? '').toUpperCase();
        const kind = [
          IngredientCategory.VIDEO,
          IngredientCategory.VIDEO_EDIT,
        ].includes(category as IngredientCategory)
          ? 'video'
          : [
                IngredientCategory.AUDIO,
                IngredientCategory.MUSIC,
                IngredientCategory.VOICE,
              ].includes(category as IngredientCategory)
            ? 'audio'
            : [
                  IngredientCategory.IMAGE,
                  IngredientCategory.IMAGE_EDIT,
                  IngredientCategory.GIF,
                  IngredientCategory.AVATAR,
                ].includes(category as IngredientCategory)
              ? 'image'
              : undefined;
        // ingredientId lets the authorized delivery projector replace the URL with a scoped grant.
        return [
          {
            assetId,
            ingredientId: assetId,
            ...(kind ? { kind } : {}),
            order,
            url: httpUrl(item.cdnUrl),
          },
        ];
      })
    : [];
  const failure = targetFailure(post);
  return {
    ...(isAccount
      ? {
          author: {
            name:
              publicText(credential.externalName) ||
              publicText(credential.label),
            handle: publicText(credential.externalHandle),
            avatarUrl: httpUrl(credential.externalAvatar),
          },
        }
      : {}),
    brandId: typeof post.brandId === 'string' ? post.brandId : null,
    createdAt: post.createdAt ?? null,
    description: post.description ?? null,
    ...(failure ? { error: failure } : {}),
    id: String(post.id),
    label: post.label ?? null,
    media,
    platform: post.platform ?? null,
    publishedAt: post.publishedAt ?? null,
    // The release (post group) that get_scheduled_release,
    // update_scheduled_release and control_scheduled_release accept.
    releaseId: typeof post.groupId === 'string' ? post.groupId : null,
    scheduledDate: post.scheduledDate ?? null,
    state: post.targetExecutionState ?? null,
    status: post.status ?? null,
    targets: [
      {
        credentialId:
          typeof post.credentialId === 'string' ? post.credentialId : null,
        platform: post.platform ?? null,
        scheduledDate: post.scheduledDate ?? null,
        state: post.targetExecutionState ?? null,
        validationState: post.targetValidationState ?? null,
      },
    ],
    timezone: typeof post.timezone === 'string' ? post.timezone : null,
    updatedAt: post.updatedAt ?? null,
  };
}
