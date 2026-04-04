export interface ChatMessageMetadata {
  generatedContent?: string;
  contentType?: string;
  platform?: string;
  mediaUrl?: string;
  wasInserted?: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: ChatMessageMetadata;
  createdAt: string;
}

export interface Thread {
  id: string;
  title?: string;
  platform?: string;
  brandId?: string;
  status: 'active' | 'archived';
  lastMessage?: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}
