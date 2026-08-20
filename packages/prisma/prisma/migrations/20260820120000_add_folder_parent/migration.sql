-- Folders become a tree. The Library sidebar needs nesting: a folder is where a
-- human filed an asset, and humans nest. `parentId` is nullable — a NULL parent
-- is a root folder, which is what every existing row becomes.
--
-- ON DELETE RESTRICT: folders are soft-deleted (`isDeleted`), so a hard delete
-- is an operator action that must not silently orphan a subtree.

ALTER TABLE "folders" ADD COLUMN "parentId" TEXT;

ALTER TABLE "folders"
  ADD CONSTRAINT "folders_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "folders_parentId_isDeleted_idx" ON "folders"("parentId", "isDeleted");
