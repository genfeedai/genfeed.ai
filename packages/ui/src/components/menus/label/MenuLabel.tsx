import type { MenuLabelProps } from '@genfeedai/props/navigation/menu.props';

export default function MenuLabel({
  label,
  icon,
  outline: OutlineIcon,
  solid: SolidIcon,
  isActive = false,
  onClick,
  chevronIcon,
}: MenuLabelProps) {
  const renderIcon = () => {
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
        <SolidIcon className="w-4 h-4" />
      ) : (
        <OutlineIcon className="w-4 h-4 group-hover:text-primary transition" />
      );
    }

    return null;
  };

  const baseClasses =
    'flex items-center gap-3 text-left px-3 py-2 transition group h-9';
  const activeClasses = isActive
    ? 'bg-primary/10 text-primary font-semibold'
    : 'hover:bg-primary/5';

  return (
    <li className="list-none mb-1">
      <div
        onClick={onClick}
        className={`${baseClasses} ${activeClasses} cursor-pointer justify-between`}
      >
        <div className="flex items-center gap-2">
          {renderIcon()}
          <span>{label}</span>
        </div>
        {chevronIcon && (
          <div className="w-4 h-4 transition-transform">{chevronIcon}</div>
        )}
      </div>
    </li>
  );
}
