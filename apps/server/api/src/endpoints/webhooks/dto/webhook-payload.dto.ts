import { ALLOW_UNKNOWN_PROPERTIES } from '@api/helpers/pipes/validation.pipe';

/**
 * Base class for every provider webhook `@Body()` DTO.
 *
 * These are classes, not interfaces, on purpose. The server compiles with
 * `emitDecoratorMetadata`, and only a class emits a runtime metatype into
 * `design:paramtypes`. An interface erases to `Object`, which the global
 * `ValidationPipe.toValidate()` excludes — so the raw provider body reached the
 * handler and the database completely unvalidated. Every subclass MUST be
 * value-imported at its `@Body()` site: an `import type` erases the same way and
 * silently restores the no-op (see
 * `.agents/memory/rules/nestjs_value_imports_for_di.md`).
 *
 * `ALLOW_UNKNOWN_PROPERTIES` turns off the pipe's whitelist stripping for this
 * family. Webhook bodies are not first-party request payloads: Chromatic
 * re-serializes the body to compare an HMAC, Heygen and Opus Pro forward it
 * verbatim to the microservices bus, and Replicate and KlingAI read vendor keys
 * (`model`, `input`, `task_result`, …) through the index signature. Stripping
 * undecorated keys would corrupt all three. Declared fields are still validated;
 * unknown keys pass through untouched, so legitimate vendor payload drift never
 * turns into a 400 and a retry storm.
 *
 * Nested vendor structures are validated at the container level only
 * (`@IsObject` / `@IsArray`, never `@ValidateNested` + `@Type`), matching
 * `AgentChatBodyDto`. Handlers already guard the nested shape at runtime, and
 * modeling it here would only add rejection surface for drift we do not control.
 *
 * Scope: payload SHAPE only. Signature, token, and IP checks are a separate
 * concern owned by each controller and are untouched by these DTOs.
 */
export abstract class WebhookPayloadDto {
  static readonly [ALLOW_UNKNOWN_PROPERTIES] = true;

  [key: string]: unknown;
}
