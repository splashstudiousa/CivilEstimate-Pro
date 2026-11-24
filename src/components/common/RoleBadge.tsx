import React from 'react';
import { UserRole } from '../../types/estimate';
import { getRoleDefinition } from '../../data/roles';
import { useEstimateStore } from '../../store/useEstimateStore';

interface RoleBadgeProps {
  role?: UserRole;
  compact?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, compact = false }) => {
  const roleDefinitions = useEstimateStore((s) => s.roleDefinitions);
  const def = getRoleDefinition(role || 'Admin', roleDefinitions);

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-tight whitespace-nowrap shrink-0 border"
      style={{
        backgroundColor: `${def.colorHex}14`,
        borderColor: `${def.colorHex}40`,
        color: def.colorHex,
      }}
      title={`${def.name} · ${def.department}`}
    >
      <span className="dark:brightness-125">{compact ? def.shortLabel : def.name}</span>
    </span>
  );
};

interface UserAvatarWithRoleProps {
  name: string;
  role?: UserRole;
  avatarUrl?: string;
  showRole?: boolean;
}

export const UserAvatarWithRole: React.FC<UserAvatarWithRoleProps> = ({
  name,
  role,
  avatarUrl,
  showRole = true,
}) => {
  const roleDefinitions = useEstimateStore((s) => s.roleDefinitions);
  const def = getRoleDefinition(role || 'Admin', roleDefinitions);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="inline-flex items-center gap-2 min-w-0">
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ backgroundColor: def.colorHex }}
          >
            {initials || 'CE'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
          {name}
        </span>
        {showRole && <RoleBadge role={def.name} compact />}
      </div>
    </div>
  );
};
