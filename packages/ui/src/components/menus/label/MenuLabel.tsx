import type { MenuLabelProps } from '@genfeedai/props/navigation/menu.props';

function MenuLabelIcon({
  icon,
  outline: OutlineIcon,
  solid: SolidIcon,
  isActive,
}: Pick<
  MenuLabelProps,
  'icon' | 'outline' | 'solid' | 'isActive'
>): React.ReactNode {
  if (icon) {
    return (
      <div
        className={
          isActive ? 'text-primary' : 'group-hover:text-primary transition'
        }
      >
        {icon}
      </div>
    );
  }

  if (OutlineIcon && SolidIcon) {
    return isActive ? (
      <SolidIcon className="size-4" />
    ) : (
      <OutlineIcon className="size-4 group-hover:text-primary transition" />
    );
  }

  return null;
}

export default function MenuLabel({
  label,
  icon,
  outline: OutlineIcon,
  solid: SolidIcon,
  isActive = false,
  onClick,
  chevronIcon,
}: MenuLabelProps) {
  const baseClasses =
    'flex items-center gap-3 text-left px-3 py-2 transition group h-9';
  const activeClasses = isActive
    ? 'bg-primary/10 text-primary font-semibold'
    : 'hover:bg-primary/5';

  return (
    <li className="list-none mb-1">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={`${baseClasses} ${activeClasses} cursor-pointer justify-between`}
      >
        <div className="flex items-center gap-2">
          <MenuLabelIcon
            icon={icon}
            outline={OutlineIcon}
            solid={SolidIcon}
            isActive={isActive}
          />
          <span>{label}</span>
        </div>
        {chevronIcon && (
          <div className="size-4 transition-transform">{chevronIcon}</div>
        )}
      </div>
    </li>
  );
}
