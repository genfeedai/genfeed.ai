type BadgeVariantInput =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | undefined;

export function getBadgeVariant(
  variant: BadgeVariantInput,
):
  | 'default'
  | 'destructive'
  | 'info'
  | 'outline'
  | 'secondary'
  | 'success'
  | 'warning' {
  switch (variant) {
    case 'error':
      return 'destructive';
    case 'accent':
    case 'primary':
      return 'default';
    case 'info':
    case 'secondary':
    case 'success':
    case 'warning':
      return variant;
    default:
      return 'default';
  }
}
