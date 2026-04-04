import type { IArticle, IIngredient } from '../index';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ConversationCanvasProps {
  selectedCreation: string | null;
  items: (IIngredient | IArticle)[];
  isLoading?: boolean;
}
