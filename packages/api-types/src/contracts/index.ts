/**
 * API Contracts
 *
 * Export all resource-specific contracts for type-safe API operations.
 * Each contract provides:
 * - Type aliases from OpenAPI (e.g., CreatePostRequest, UpdatePostRequest)
 * - Zod schemas for runtime validation (e.g., createPostSchema)
 * - Inferred form data types (e.g., CreatePostFormData)
 */

export * from '@api-types/contracts/ingredients.contract';
export * from '@api-types/contracts/posts.contract';
