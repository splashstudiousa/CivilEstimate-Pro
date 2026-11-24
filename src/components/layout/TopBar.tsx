import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Menu,
  Moon,
  Plus,
  Redo2,
  Search,
  Sun,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { useEstimateStore } from '../../store/useEstimateStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { CurrencyCode, UserRole } from '../../types/estimate';
import { RoleBadge } from '../common/RoleBadge';
import { hasModulePermission } from '../../data/roles';

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileMenu }) => {
  const { project, summary, userRole, activeRoleDef, activeUser, roleDefinitions } =
    useActiveProject();
  const projects = useEstimateStore((s) => s.projects);
  const teamUsers = useEstimateStore((s) => s.teamUsers);
  const setActiveProject = useEstimateStore((s) => s.setActiveProject);
  const updateActiveProject = useEstimateStore((s) => s.updateActiveProject);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const setUserRole = useEstimateStore((s) => s.setUserRole);
  const setActiveUserId = useEstimateStore((s) => s.setActiveUserId);
  const markNotificationRead = useEstimateStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useEstimateStore((s) => s.markAllNotificationsRead);
  const theme = useEstimateStore((s) => s.theme);
  const toggleTheme = useEstimateStore((s) => s.toggleTheme);
  const unitSystem = useEstimateStore((s) => s.unitSystem);
  const setUnitSystem = useEstimateStore((s) => s.setUnitSystem);
  const globalSearch = useEstimateStore((s) => s.globalSearch);
  const setGlobalSearch = useEstimateStore((s) => s.setGlobalSearch);
  const undo = useEstimateStore((s) => s.undo);
  const redo = useEstimateStore((s) => s.redo);
  const pastCount = useEstimateStore((s) => s.past.length);
  const futureCount = useEstimateStore((s) => s.future.length);

  const [showNotif, setShowNotif] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [notifScope, setNotifScope] = useState<'role' | 'all'>('role');
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setShowRoleMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const assignedRolesList = activeUser?.assignedRoles?.length
    ? roleDefinitions.filter((r) => activeUser.assignedRoles.includes(r.name))
    : roleDefinitions;

  const allNotifications = project.notifications || [];
  const roleNotifications =
    notifScope === 'all' || userRole === 'Admin'
      ? allNotifications
      : allNotifications.filter((n) => n.targetRoles.includes(userRole));

  const unreadRoleNotifs = allNotifications.filter(
    (n) => (userRole === 'Admin' || n.targetRoles.includes(userRole)) && !n.readByRoles.includes(userRole)
  );
  const totalBadgeCount = unreadRoleNotifs.length + summary.alerts.length;

  const canEditProject = hasModulePermission(userRole, 'setup', 'edit', roleDefinitions);

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-20 shrink-0">
      {/* Left: Mobile Trigger + Project Selector + Undo/Redo */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex items-center">
            <select
              aria-label="Active project selector"
              value={project.id}
              onChange={(e) => setActiveProject(e.target.value)}
              className="appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-semibold rounded-md pl-3 pr-8 py-1.5 max-w-[180px] sm:max-w-[260px] truncate focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none absolute right-2.5" />
          </div>

          {canEditProject && (
            <button
              type="button"
              onClick={() => setActiveModule('setup')}
              title="New or Configure Project"
              className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-orange-600" />
              <span>New</span>
            </button>
          )}
        </div>

        {userRole !== 'Client/Viewer' && (
          <div className="hidden lg:flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2.5">
            <button
              type="button"
              onClick={undo}
              disabled={pastCount === 0}
              title="Undo last change"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={futureCount === 0}
              title="Redo change"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Search, Currency, Units, Role/Department Switcher, Notifications, Theme */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Global Search */}
        <div className="hidden xl:flex items-center relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search BOQ, tasks, rates..."
            className="w-40 2xl:w-52 pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Currency Quick Switch */}
        <select
          aria-label="Project currency"
          value={project.currency}
          disabled={!canEditProject}
          onChange={(e) => updateActiveProject({ currency: e.target.value as CurrencyCode })}
          className="hidden md:block px-2 py-1 text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 cursor-pointer disabled:opacity-70"
        >
          <option value="PKR">PKR (Rs.)</option>
          <option value="USD">USD ($)</option>
          <option value="INR">INR (₹)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
          <option value="AED">AED</option>
        </select>

        {/* Unit System Segmented Switch */}
        <div
          className="hidden lg:flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700"
          role="group"
          aria-label="Unit system"
        >
          <button
            type="button"
            onClick={() => setUnitSystem('imperial')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              unitSystem === 'imperial'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            FPS (ft)
          </button>
          <button
            type="button"
            onClick={() => setUnitSystem('metric')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              unitSystem === 'metric'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            SI (m)
          </button>
        </div>

        {/* Notifications (Filtered by Active Role) */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotif((v) => !v)}
            className="relative p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            aria-label="Role notifications and engineering alerts"
          >
            <Bell className="w-4 h-4" />
            {totalBadgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded bg-orange-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {totalBadgeCount}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 mt-2 w-88 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Notification Center
                  </span>
                  <RoleBadge role={userRole} compact />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNotifScope((s) => (s === 'role' ? 'all' : 'role'))}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    {notifScope === 'role' ? 'Show All' : 'Filter by Role'}
                  </button>
                  {unreadRoleNotifs.length > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="text-[11px] font-medium text-orange-600 hover:underline"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {roleNotifications.map((n) => {
                  const isRead = n.readByRoles.includes(userRole);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markNotificationRead(n.id);
                        setActiveModule(n.module);
                        setShowNotif(false);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                        !isRead ? 'bg-orange-50/40 dark:bg-orange-950/15' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={n.fromRole} compact />
                          <span>{n.fromUser}</span>
                        </div>
                        <span className="font-mono">{n.createdAt.slice(0, 10)}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">
                        {n.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {n.message}
                      </div>
                    </button>
                  );
                })}

                {summary.alerts.map((al) => (
                  <button
                    key={al.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(al.module);
                      setShowNotif(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start gap-2.5"
                  >
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        al.severity === 'error'
                          ? 'text-red-600'
                          : al.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-sky-600'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {al.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {al.description}
                      </div>
                    </div>
                  </button>
                ))}

                {roleNotifications.length === 0 && summary.alerts.length === 0 && (
                  <div className="p-4 text-xs text-slate-500">
                    No pending alerts or handoffs for {userRole}.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Light / Dark Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle light or dark mode"
          className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Switch Role / Department Dropdown */}
        <div className="relative" ref={roleRef}>
          <button
            type="button"
            onClick={() => setShowRoleMenu((v) => !v)}
            aria-label="Switch Role or Department"
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {activeUser?.avatarUrl ? (
              <img
                src={activeUser.avatarUrl}
                alt={activeUser.name}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: activeRoleDef.colorHex }}
              >
                {activeRoleDef.shortLabel}
              </div>
            )}
            <div className="hidden sm:flex flex-col items-start text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {activeUser?.name.split(',')[0] || 'Workspace'}
                </span>
                <RoleBadge role={userRole} compact />
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate max-w-[140px]">
                {activeRoleDef.department}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Switch Role / Department
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Instant workspace, menu & dashboard switch
                  </div>
                </div>
                <UserCheck className="w-4 h-4 text-orange-600 shrink-0" />
              </div>

              {/* Active Team User Switcher */}
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <label className="block text-[10px] font-medium text-slate-500 mb-1">
                  Signed-In Team Member
                </label>
                <select
                  value={activeUser?.id || ''}
                  onChange={(e) => setActiveUserId(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-slate-100"
                >
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.assignedRoles.length} role{u.assignedRoles.length > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned Roles List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {assignedRolesList.map((r) => {
                  const isActive = r.name === userRole;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setUserRole(r.name as UserRole);
                        setShowRoleMenu(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 flex items-start justify-between gap-2 transition-colors ${
                        isActive
                          ? 'bg-orange-50/70 dark:bg-orange-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={r.name} />
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {r.department}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                          {r.description}
                        </div>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>

              {userRole === 'Admin' && (
                <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModule('settings');
                      setShowRoleMenu(false);
                    }}
                    className="text-xs font-medium text-orange-600 hover:underline dark:text-orange-400"
                  >
                    Manage Roles, Teams & Approval Limits →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
