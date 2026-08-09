import {
  CalendarClock,
  Copy,
  ExternalLink,
  Eye,
  Pencil,
  RefreshCw,
  Repeat2,
  Sparkles,
  Trash2,
} from 'lucide-react';

export const postCardIcons = {
  delete: <Trash2 className="size-4" />,
  edit: <Pencil className="size-4" />,
  remix: <Copy className="size-4" />,
  repurpose: <Repeat2 className="size-4" />,
  rewriteWithAgent: <Sparkles className="size-4" />,
  retry: <RefreshCw className="size-4" />,
  suggestScheduleWithAgent: <CalendarClock className="size-4" />,
  viewIngredient: <Eye className="size-4" />,
  viewPlatform: <ExternalLink className="size-4" />,
};
