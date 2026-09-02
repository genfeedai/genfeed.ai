export interface RecentAsset {
  id: string;
  title: string;
  category: 'image' | 'video' | 'voice' | 'music' | 'article';
  createdAt: string;
  href: string;
}
