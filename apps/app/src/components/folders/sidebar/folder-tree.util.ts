import type { FolderTreeNode, IFolder } from '@genfeedai/contracts/interfaces';

function indexFoldersById(folders: IFolder[]): Map<string, IFolder> {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

/**
 * A folder whose ancestor chain loops back on itself can never reach a root, so
 * nesting it would drop it — and everything under it — out of the sidebar. The
 * API does not create cycles, but the sidebar renders whatever it is handed, so
 * a looping folder is promoted to a root instead of disappearing.
 */
function getIsRootReachable(
  foldersById: Map<string, IFolder>,
  folder: IFolder,
): boolean {
  const visitedIds = new Set<string>([folder.id]);
  let current = folder.parentId ? foldersById.get(folder.parentId) : undefined;

  while (current) {
    if (visitedIds.has(current.id)) {
      return false;
    }

    visitedIds.add(current.id);
    current = current.parentId ? foldersById.get(current.parentId) : undefined;
  }

  return true;
}

function sortNodes(nodes: FolderTreeNode[], depth: number): FolderTreeNode[] {
  nodes.sort((left, right) =>
    left.folder.label.localeCompare(right.folder.label),
  );

  for (const node of nodes) {
    node.depth = depth;
    sortNodes(node.children, depth + 1);
  }

  return nodes;
}

/**
 * Nest a flat folder page by `parentId`.
 *
 * A folder whose parent is missing from the page — filtered out, soft deleted,
 * or owned by another brand — is shown as a root rather than hidden, because a
 * folder you cannot see is indistinguishable from one that does not exist.
 */
export function buildFolderTree(folders: IFolder[]): FolderTreeNode[] {
  const foldersById = indexFoldersById(folders);
  const nodesById = new Map<string, FolderTreeNode>(
    folders.map((folder) => [folder.id, { children: [], depth: 0, folder }]),
  );
  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    const node = nodesById.get(folder.id);

    if (!node) {
      continue;
    }

    const parentNode =
      folder.parentId && getIsRootReachable(foldersById, folder)
        ? nodesById.get(folder.parentId)
        : undefined;

    if (parentNode) {
      parentNode.children.push(node);
      continue;
    }

    roots.push(node);
  }

  return sortNodes(roots, 0);
}

/**
 * Every folder between a selection and its root, so the sidebar can open the
 * branch that holds the folder you are actually looking at.
 */
export function getFolderAncestorIds(
  folders: IFolder[],
  folderId?: string | null,
): Set<string> {
  const ancestorIds = new Set<string>();

  if (!folderId) {
    return ancestorIds;
  }

  const foldersById = indexFoldersById(folders);
  let current = foldersById.get(folderId);

  while (current?.parentId) {
    const parent = foldersById.get(current.parentId);

    if (!parent || ancestorIds.has(parent.id)) {
      return ancestorIds;
    }

    ancestorIds.add(parent.id);
    current = parent;
  }

  return ancestorIds;
}
