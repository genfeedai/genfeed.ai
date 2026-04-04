export interface BreadcrumbSegment {
  href: string;
  label: string;
}

export interface BreadcrumbProps {
  segments?: BreadcrumbSegment[];
  className?: string;
}
