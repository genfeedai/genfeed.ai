/**
 * Mutating API routes that named no API-key scope when the ratchet landed
 * (#9129). Entries may ONLY be removed (by adding @RequiredScopes or
 * @ApiKeyReadAccess), never added; see check-api-key-route-scopes.ts.
 * Key format: <file>::<Class>.<method>.
 */
export const API_KEY_ROUTE_SCOPE_BASELINE: readonly string[] = [
  'apps/server/api/src/services/telegram-bot/telegram-bot.controller.ts::TelegramBotController.webhook',
];
