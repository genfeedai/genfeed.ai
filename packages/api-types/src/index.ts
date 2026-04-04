/**
 * @genfeedai/api-types
 *
 * Auto-generated TypeScript types from OpenAPI spec with Zod validation schemas.
 *
 * Usage:
 *   import { CreatePostRequest, createPostSchema } from '@genfeedai/api-types';
 *
 *   // Type-safe service calls
 *   const post = await postsService.post(payload satisfies CreatePostRequest);
 *
 *   // Form validation with Zod
 *   const form = useForm<CreatePostRequest>({
 *     resolver: zodResolver(createPostSchema),
 *   });
 */

export * from '@api-types/contracts';
export type { components, paths } from '@api-types/generated/api';
export * from '@api-types/helpers';
