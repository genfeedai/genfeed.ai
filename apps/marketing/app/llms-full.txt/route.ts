import { buildLlmsFull } from '@data/llms-text.data';
import { getPublicModels } from '@public/models/models-loader';

/**
 * `/llms-full.txt`, rendered from the live public model catalog like `/models`
 * so the model list matches what customers can use (inactive, legacy and
 * unpriceable models are already left out by the catalog). The route is
 * cached and regenerates every five minutes, which bounds how long a render
 * made while the API was down (no model list) is served.
 */
export const revalidate = 300;

export async function GET(): Promise<Response> {
  const models = await getPublicModels();

  return new Response(buildLlmsFull(models), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
