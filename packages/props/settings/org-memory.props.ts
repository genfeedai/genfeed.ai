export interface OrgMemoryAuthor {
  email?: string | null;
  handle?: string | null;
  id: string;
  name?: string | null;
}

export interface OrgMemoryEntry {
  content?: string | null;
  createdAt?: string | Date;
  id: string;
  kind?: string | null;
  promotedSkillId?: string | null;
  scope?: string | null;
  summary?: string | null;
  user?: OrgMemoryAuthor | null;
}
