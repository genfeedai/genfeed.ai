import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';

/**
 * Build MongoDB update operations ($set and $unset) from an update DTO
 * Processes relationship fields and separates them into $set (non-null) and $unset (null) operations
 *
 * @param updateDto - The update DTO containing fields to update
 * @param relationshipFields - Array of field names that are relationship fields (ObjectId refs)
 * @returns Object with $set and $unset operations for MongoDB
 *
 * @example
 * ```typescript
 * const updateOps = await buildUpdateOperations(
 *   { folder: 'some-id', parent: null },
 *   ['folder', 'parent']
 * );
 * // Returns: { $set: { folder: ObjectId('some-id') }, $unset: { parent: '' } }
 * ```
 */
export async function buildUpdateOperations<T extends Record<string, unknown>>(
  updateDto: T,
  relationshipFields: string[],
): Promise<{
  $set?: Record<string, unknown>;
  $unset?: Record<string, string>;
}> {
  // Start with all fields in $set
  const fieldsToSet: Record<string, unknown> = { ...updateDto };
  const fieldsToUnset: Record<string, string> = {};

  // Process each relationship field
  for (const fieldName of relationshipFields) {
    if (Object.hasOwn(updateDto, fieldName)) {
      const convertedValue = await ObjectIdUtil.convertRelationshipField(
        updateDto[fieldName],
        fieldName,
      );

      if (convertedValue === null) {
        // Field should be removed - add to $unset
        fieldsToUnset[fieldName] = '';
        delete fieldsToSet[fieldName];
      } else {
        // Field has a value - keep in $set with converted ObjectId
        fieldsToSet[fieldName] = convertedValue;
      }
    }
  }

  // Build result object (only include $set/$unset if they have fields)
  const result: {
    $set?: Record<string, unknown>;
    $unset?: Record<string, string>;
  } = {};

  if (Object.keys(fieldsToSet).length > 0) {
    result.$set = fieldsToSet;
  }

  if (Object.keys(fieldsToUnset).length > 0) {
    result.$unset = fieldsToUnset;
  }

  return result;
}
