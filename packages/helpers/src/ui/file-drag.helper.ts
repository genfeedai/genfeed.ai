interface DragEventWithTransfer {
  dataTransfer?: { types?: ArrayLike<string> | null } | null;
}

export function isFileDrag(event: DragEventWithTransfer): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
