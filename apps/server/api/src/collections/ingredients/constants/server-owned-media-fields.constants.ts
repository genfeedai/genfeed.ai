/**
 * Ingredient fields a client may never write: they decide which stored object
 * is served. Upload and generation completion own them. The global
 * ValidationPipe does not whitelist, so every client PATCH path must strip them.
 */
export const SERVER_OWNED_MEDIA_FIELDS = ['cdnUrl', 's3Key'] as const;
