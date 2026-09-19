import { buildProtectedResourceMetadataPaths } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import {
  getMcpProtectedResourceMetadata,
  getMcpServerCard,
  getPublicMcpUrl,
} from '@mcp/mcp/setup-page';
import type { Express, Request, Response } from 'express';

export const MCP_SERVER_CARD_PATHS = [
  '/.well-known/mcp.json',
  '/.well-known/mcp/server-card.json',
  '/.well-known/mcp/server-cards.json',
] as const;

/**
 * Unauthenticated discovery documents, registered directly on the Express
 * instance so they sit outside the `/v1` global prefix.
 *
 * Every route answers with `Access-Control-Allow-Origin: *`: an MCP client
 * running in a browser fetches these documents cross-origin before it holds
 * any credential, so the restrictive credentialed CORS policy the rest of the
 * service uses cannot apply here (#4553 defect 4).
 */
export function registerWellKnownRoutes(expressApp: Express): void {
  // RFC 9728 §3: a resource whose identifier carries a path component
  // (`.../mcp`) has its metadata at the well-known path suffixed with that
  // path. The bare path is kept for clients that ignore §3; both serve the
  // same document (#4553 defect 2).
  for (const path of buildProtectedResourceMetadataPaths(getPublicMcpUrl())) {
    expressApp.get(path, (_req: Request, res: Response) => {
      res
        .set('Access-Control-Allow-Origin', '*')
        .set('Cache-Control', 'public, max-age=300')
        .status(200)
        .json(getMcpProtectedResourceMetadata());
    });
  }

  for (const path of MCP_SERVER_CARD_PATHS) {
    expressApp.get(path, (_req: Request, res: Response) => {
      res
        .set('Access-Control-Allow-Origin', '*')
        .set('Cache-Control', 'public, max-age=3600')
        .status(200)
        .json(getMcpServerCard());
    });
  }
}
