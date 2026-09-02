function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function areWorkflowMetadataValuesEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    return (
      left.length === right.length &&
      left.every((item, index) =>
        areWorkflowMetadataValuesEqual(item, right[index]),
      )
    );
  }

  if (isMetadataRecord(left) || isMetadataRecord(right)) {
    if (!isMetadataRecord(left) || !isMetadataRecord(right)) {
      return false;
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) &&
          areWorkflowMetadataValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
}
