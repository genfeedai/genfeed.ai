export interface GallerySidebarProps {
  onLinkClick?: () => void;
}

export interface GalleryListProps {
  type?: 'images' | 'videos' | 'musics';
  className?: string;
}
