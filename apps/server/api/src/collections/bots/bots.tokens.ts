/**
 * DI alias for BotsLivestreamService.
 *
 * BotsRestreamChatService calls the livestream service, while the livestream
 * service optionally calls the Restream chat service. Injecting through a token
 * removes the reverse class-value import that otherwise crashes the bundled API
 * during module evaluation before Nest can resolve the forward reference.
 */
export const BOTS_LIVESTREAM_SERVICE = Symbol('BOTS_LIVESTREAM_SERVICE');
