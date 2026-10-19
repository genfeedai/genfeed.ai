import { cn } from '@genfeedai/helpers';
import type { AdminUserAvatarProps } from '@props/admin/admin-user.props';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { getUserDisplayName, getUserInitial } from './user-display.helpers';

export default function UserAvatar({ user, className }: AdminUserAvatarProps) {
  return (
    <Avatar className={cn('size-7', className)}>
      {user.avatar ? (
        <AvatarImage
          alt={getUserDisplayName(user) ?? user.email}
          src={user.avatar}
        />
      ) : null}
      <AvatarFallback className="text-2xs font-semibold">
        {getUserInitial(user)}
      </AvatarFallback>
    </Avatar>
  );
}
