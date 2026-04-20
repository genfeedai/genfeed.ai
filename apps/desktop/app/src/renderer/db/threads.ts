import type {
  IDesktopGeneratedContent,
  IDesktopMessage,
  IDesktopThread,
} from '@genfeedai/desktop-contracts';
import { ensureUser, getDb } from './pglite';

interface ThreadRow {
  created_at: string;
  id: string;
  status: string;
  title: string;
  updated_at: string;
  user_id: string;
  workspace_id: string | null;
}

interface MessageRow {
  content: string;
  created_at: string;
  draft_id: string | null;
  generated_content: string | null;
  id: string;
  role: 'assistant' | 'user';
  thread_id: string;
}

function rowToThread(
  row: ThreadRow,
  messages: IDesktopMessage[],
): IDesktopThread {
  return {
    createdAt: row.created_at,
    id: row.id,
    messages,
    status: row.status as IDesktopThread['status'],
    title: row.title,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id ?? undefined,
  };
}

function rowToMessage(row: MessageRow): IDesktopMessage {
  return {
    content: row.content,
    createdAt: row.created_at,
    draftId: row.draft_id ?? undefined,
    generatedContent: row.generated_content
      ? (JSON.parse(row.generated_content) as IDesktopGeneratedContent)
      : undefined,
    id: row.id,
    role: row.role,
  };
}

export async function queryThreads(userId: string): Promise<IDesktopThread[]> {
  const db = await getDb();

  const threadResult = await db.query<ThreadRow>(
    'SELECT * FROM threads WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  );

  if (threadResult.rows.length === 0) return [];

  const threadIds = threadResult.rows.map((r) => r.id);
  const placeholders = threadIds.map((_, i) => `$${i + 1}`).join(', ');
  const msgResult = await db.query<MessageRow>(
    `SELECT * FROM messages WHERE thread_id IN (${placeholders}) ORDER BY created_at ASC`,
    threadIds,
  );

  const msgsByThread = new Map<string, IDesktopMessage[]>();
  for (const row of msgResult.rows) {
    const msgs = msgsByThread.get(row.thread_id) ?? [];
    msgs.push(rowToMessage(row));
    msgsByThread.set(row.thread_id, msgs);
  }

  return threadResult.rows.map((row) =>
    rowToThread(row, msgsByThread.get(row.id) ?? []),
  );
}

export async function upsertThread(
  userId: string,
  thread: IDesktopThread,
): Promise<void> {
  const db = await getDb();
  await ensureUser(userId);

  await db.query(
    `INSERT INTO threads (id, user_id, workspace_id, title, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       workspace_id = EXCLUDED.workspace_id,
       updated_at = EXCLUDED.updated_at`,
    [
      thread.id,
      userId,
      thread.workspaceId ?? null,
      thread.title,
      thread.status ?? 'idle',
      thread.createdAt,
      thread.updatedAt,
    ],
  );
}

export async function upsertMessages(
  threadId: string,
  messages: IDesktopMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const db = await getDb();

  for (const msg of messages) {
    await db.query(
      `INSERT INTO messages (id, thread_id, role, content, created_at, draft_id, generated_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         draft_id = EXCLUDED.draft_id,
         generated_content = EXCLUDED.generated_content`,
      [
        msg.id,
        threadId,
        msg.role,
        msg.content,
        msg.createdAt,
        msg.draftId ?? null,
        msg.generatedContent ? JSON.stringify(msg.generatedContent) : null,
      ],
    );
  }
}
