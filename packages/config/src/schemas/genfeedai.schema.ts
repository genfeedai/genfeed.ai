import {
  deriveMcpResourceIdentifier,
  type MCP_RESOURCE_URL_ENV_KEYS,
  McpResourceConfigurationError,
} from '@genfeedai/helpers/integrations/mcp-resource.helper';
import Joi from 'joi';

import { isSelfHostedDeployment } from '../deployment';
import { conditionalRequired } from '../helpers';

type McpResourceUrlKey = (typeof MCP_RESOURCE_URL_ENV_KEYS)[number];

/**
 * The MCP URL must yield the protected-resource identifier both the MCP
 * server (advertises) and the API (enforces) derive with the shared rule.
 * A value the rule rejects fails config validation at startup, naming the
 * variable, instead of surfacing as `invalid_target` at a user's token
 * exchange (#4553).
 */
function mcpResourceUrl(key: McpResourceUrlKey): Joi.StringSchema {
  return Joi.string()
    .uri()
    .custom((value: string, helpers) => {
      try {
        deriveMcpResourceIdentifier(value, key);
      } catch (error: unknown) {
        if (error instanceof McpResourceConfigurationError) {
          return helpers.message({ custom: error.message });
        }
        throw error;
      }
      return value;
    }, 'MCP resource identifier validation');
}

/**
 * Genfeed internal URLs and services
 */
export const genfeedaiUrlsSchema = {
  GENFEEDAI_API_PUBLIC_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_API_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_APP_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_CDN_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_MCP_PUBLIC_URL: conditionalRequired(
    mcpResourceUrl('GENFEEDAI_MCP_PUBLIC_URL'),
  ),
  GENFEEDAI_WEBHOOKS_URL: conditionalRequired(Joi.string().uri()),
};

/**
 * Microservices URLs (optional in cloud, localhost defaults in self-hosted)
 */
export const microservicesSchema = {
  GENFEEDAI_MICROSERVICES_FILES_URL: isSelfHostedDeployment()
    ? Joi.string().default('http://localhost:3012')
    : Joi.string().uri().optional(),
  GENFEEDAI_MICROSERVICES_MCP_URL: isSelfHostedDeployment()
    ? mcpResourceUrl('GENFEEDAI_MICROSERVICES_MCP_URL').default(
        'http://localhost:3014',
      )
    : mcpResourceUrl('GENFEEDAI_MICROSERVICES_MCP_URL').optional(),
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: isSelfHostedDeployment()
    ? Joi.string().default('http://localhost:3011')
    : Joi.string().uri().optional(),
};

/**
 * Internal auth - service-to-service communication
 */
export const internalAuthSchema = {
  BULL_BOARD_AUTH_TOKEN: Joi.string()
    .optional()
    .description('Authentication token for Bull Board admin interface'),
  GENFEED_API_KEY: Joi.string()
    .optional()
    .allow('')
    .description('Self-hosted managed inference API key for Genfeed Cloud'),
  GENFEED_MANAGED_INFERENCE_URL: Joi.string()
    .uri()
    .optional()
    .allow('')
    .description('Override URL for the Genfeed Cloud managed inference API'),
  GENFEEDAI_API_KEY: Joi.string()
    .optional()
    .description('API key for internal service-to-service authentication'),
  GITHUB_WEBHOOK_SECRET: Joi.string()
    .optional()
    .description(
      'HMAC secret for GitHub Secret Scanning Partner Program webhooks',
    ),
  TOKEN_ENCRYPTION_KEY: conditionalRequired(Joi.string().min(32)).description(
    'Encryption key for sensitive data. Must be at least 32 characters.',
  ),
};

/**
 * Minimal Genfeed config for microservices (just API URL)
 */
export const genfeedaiMinimalSchema = {
  GENFEEDAI_API_PUBLIC_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_API_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_MCP_PUBLIC_URL: conditionalRequired(
    mcpResourceUrl('GENFEEDAI_MCP_PUBLIC_URL'),
  ),
};
