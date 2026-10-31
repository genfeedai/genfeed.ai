import type { FolderTreeNode, IFolder } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import { buildFolderTree, getFolderAncestorIds } from './folder-tree.util';

function createFolder(
  id: string,
  label: string,
  parentId?: string | null,
): IFolder {
  return { id, label, parentId } as IFolder;
}

function getLabels(nodes: FolderTreeNode[]): string[] {
  return nodes.map((node) => node.folder.label);
}

describe('buildFolderTree', () => {
  it('nests children under their parent', () => {
    const tree = buildFolderTree([
      createFolder('1', 'Campaigns'),
      createFolder('2', 'Spring', '1'),
      createFolder('3', 'Summer', '1'),
    ]);

    expect(getLabels(tree)).toEqual(['Campaigns']);
    expect(getLabels(tree[0].children)).toEqual(['Spring', 'Summer']);
  });

  it('stamps the depth of every level', () => {
    const tree = buildFolderTree([
      createFolder('1', 'Campaigns'),
      createFolder('2', 'Spring', '1'),
      createFolder('3', 'Launch', '2'),
    ]);

    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('sorts each level by label', () => {
    const tree = buildFolderTree([
      createFolder('2', 'Brand'),
      createFolder('1', 'Ads'),
    ]);

    expect(getLabels(tree)).toEqual(['Ads', 'Brand']);
  });

  it('shows a folder whose parent is missing from the page as a root', () => {
    const tree = buildFolderTree([createFolder('2', 'Orphan', 'missing')]);

    expect(getLabels(tree)).toEqual(['Orphan']);
  });

  it('keeps a cyclic folder visible instead of dropping it', () => {
    const tree = buildFolderTree([
      createFolder('1', 'Loop A', '2'),
      createFolder('2', 'Loop B', '1'),
    ]);

    expect(getLabels(tree).sort()).toEqual(['Loop A', 'Loop B']);
  });

  it('treats a null parent as a root', () => {
    const tree = buildFolderTree([createFolder('1', 'Root', null)]);

    expect(getLabels(tree)).toEqual(['Root']);
  });

  it('returns nothing for an empty page', () => {
    expect(buildFolderTree([])).toEqual([]);
  });
});

describe('getFolderAncestorIds', () => {
  const folders = [
    createFolder('1', 'Campaigns'),
    createFolder('2', 'Spring', '1'),
    createFolder('3', 'Launch', '2'),
  ];

  it('collects every folder between a selection and its root', () => {
    expect([...getFolderAncestorIds(folders, '3')]).toEqual(['2', '1']);
  });

  it('returns nothing for a root selection', () => {
    expect([...getFolderAncestorIds(folders, '1')]).toEqual([]);
  });

  it('returns nothing when nothing is selected', () => {
    expect([...getFolderAncestorIds(folders, null)]).toEqual([]);
  });

  it('stops on a cycle instead of looping forever', () => {
    const cyclic = [
      createFolder('1', 'Loop A', '2'),
      createFolder('2', 'Loop B', '1'),
    ];

    expect([...getFolderAncestorIds(cyclic, '1')].sort()).toEqual(['1', '2']);
  });
});
