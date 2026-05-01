import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';

/**
 * Build a Prisma update payload from an update DTO.
 * Processes relationship fields and converts empty relationship values to null.
 *
 * @param updateDto - The update DTO containing fields to update
 * @param relationshipFields - Array of field names that are relationship fields (ObjectId refs)
 * @returns Plain Prisma update data
 *
 * @example
 * ```typescript
 * const updateOps = await buildUpdateOperations(
 *   { folder: 'some-id', parent: null },
 *   ['folder', 'parent']
 * );
 * // Returns: { folder: 'some-id', parent: null }
 * ```
 */
export async function buildUpdateOperations<T extends Record<string, unknown>>(
  updateDto: T,
  relationshipFields: string[],
): Promise<Record<string, unknown>> {
  const fieldsToSet: Record<string, unknown> = { ...updateDto };

  // Process each relationship field
  for (const fieldName of relationshipFields) {
    if (Object.hasOwn(updateDto, fieldName)) {
      const convertedValue = await ObjectIdUtil.convertRelationshipField(
        updateDto[fieldName],
        fieldName,
      );

      fieldsToSet[fieldName] = convertedValue;
    }
  }

  return fieldsToSet;
}
