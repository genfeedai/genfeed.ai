import express from 'express';

export function createReplicateWebhookBodyParser(
  apiPrefix: string,
): ReturnType<typeof express.json> {
  const callbackPath =
    `/${apiPrefix}/webhooks/replicate/callback`.toLowerCase();
  const parseJson = express.json({
    limit: '50mb',
    verify(request, _response, body) {
      Object.assign(request, { rawBody: body });
    },
  });

  return (request, response, next) => {
    const pathname = request.url?.split('?', 1)[0]?.toLowerCase();
    if (
      request.method !== 'POST' ||
      (pathname !== callbackPath && pathname !== `${callbackPath}/`)
    ) {
      next();
      return;
    }

    parseJson(request, response, next);
  };
}
