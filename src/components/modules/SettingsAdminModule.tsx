import React, { useState } from 'react';
import {
  CheckSquare,
  Download,
  Lock,
  Plus,
  RotateCcw,
  Shield,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEstimateStore } from '../../store/useEstimateStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import {
  NavModule,
  PermissionAction,
  UnitSystem,
  UserRole,
} from '../../types/estimate';
import { formatCurrency } from '../../engine/formatters';
import { normalizeRoleName } from '../../data/roles';
import { RoleBadge } from '../common/RoleBadge';

const MODULE_LABELS: { id: NavModule; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'setup', label: 'Project Setup' },
  { id: 'takeoff', label: 'Drawing Takeoff' },
  { id: 'pipeline', label: 'Drawing to Estimate' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'rate-analysis', label: 'Rate Analysis' },
  { id: 'abstract-quantities', label: 'Abstract of Qty' },
  { id: 'abstract-cost', label: 'Abstract of Cost' },
  { id: 'materials', label: 'Materials' },
  { id: 'labor-equipment', label: 'Labor & Equip.' },
  { id: 'planner', label: 'Project Planner' },
  { id: 'timeline', label: 'Gantt & CPM' },
  { id: 'collaboration', label: 'Workflow & Tasks' },
  { id: 'unit-converter', label: 'Unit Converter' },
  { id: 'reports', label: 'Reports & Export' },
  { id: 'settings', label: 'Settings & Roles' },
];

const PERM_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'approve',
  'export',
  'delete',
];

const COLOR_SWATCHES = [
  '#0F2137',
  '#EA580C',
  '#0284C7',
  '#0D9488',
  '#D97706',
  '#4F46E5',
  '#16A34A',
  '#7C3AED',
  '#0E7490',
  '#BE123C',
];

export const SettingsAdminModule: React.FC = () => {
  const { project, visibleProjects, userRole, roleDefinitions, activeUser, userMemory } =
    useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const updateCompanyProfile = useEstimateStore((s) => s.updateCompanyProfile);
  const unitSystem = useEstimateStore((s) => s.unitSystem);
  const setUnitSystem = useEstimateStore((s) => s.setUnitSystem);
  const setUserRole = useEstimateStore((s) => s.setUserRole);
  const teamUsers = useEstimateStore((s) => s.teamUsers);
  const addCustomRole = useEstimateStore((s) => s.addCustomRole);
  const updateRoleDefinition = useEstimateStore((s) => s.updateRoleDefinition);
  const updateTeamUser = useEstimateStore((s) => s.updateTeamUser);
  const addTeamUser = useEstimateStore((s) => s.addTeamUser);
  const resources = useEstimateStore((s) => s.resources);
  const auditLog = useEstimateStore((s) => s.auditLog);
  const restoreBackup = useEstimateStore((s) => s.restoreBackup);
  const resetDemoData = useEstimateStore((s) => s.resetDemoData);
  const updateUserMemory = useEstimateStore((s) => s.updateUserMemory);
  const clearUserMemory = useEstimateStore((s) => s.clearUserMemory);

  const isAdmin = normalizeRoleName(userRole) === 'Admin';
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    roleDefinitions[1]?.id || roleDefinitions[0]?.id || 'role-pm'
  );

  // New custom role form
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDept, setNewRoleDept] = useState('Quality & HSE');
  const [newRoleColor, setNewRoleColor] = useState('#0D9488');
  const [newRoleLimit, setNewRoleLimit] = useState(1000000);
  const [templateRoleId, setTemplateRoleId] = useState('role-site-engineer');

  // New team user form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserTitle, setNewUserTitle] = useState('Assistant Quantity Surveyor');
  const [newUserDept, setNewUserDept] = useState('Cost & Quantity Surveying');
  const [newUserTeam, setNewUserTeam] = useState('Estimating Unit B');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Estimator/QS');

  const selectedRole =
    roleDefinitions.find((r) => r.id === selectedRoleId) || roleDefinitions[0];

  const handleToggleSidebarModule = (modId: NavModule) => {
    if (!isAdmin || !selectedRole) return;
    const exists = selectedRole.sidebarModules.includes(modId);
    const nextSidebar = exists
      ? selectedRole.sidebarModules.filter((m) => m !== modId)
      : [...selectedRole.sidebarModules, modId];
    const nextPerms = { ...selectedRole.permissions };
    if (!exists && !(nextPerms[modId] || []).includes('view')) {
      nextPerms[modId] = ['view', ...(nextPerms[modId] || [])];
    }
    updateRoleDefinition(selectedRole.id, {
      sidebarModules: nextSidebar,
      permissions: nextPerms,
    });
  };

  const handleTogglePermission = (modId: NavModule, action: PermissionAction) => {
    if (!isAdmin || !selectedRole) return;
    const current = selectedRole.permissions[modId] || [];
    const has = current.includes(action);
    const next = has ? current.filter((a) => a !== action) : [...current, action];
    const nextSidebar =
      !has && action === 'view' && !selectedRole.sidebarModules.includes(modId)
        ? [...selectedRole.sidebarModules, modId]
        : selectedRole.sidebarModules;
    updateRoleDefinition(selectedRole.id, {
      sidebarModules: nextSidebar,
      permissions: {
        ...selectedRole.permissions,
        [modId]: next,
      },
    });
  };

  const handleCreateCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newRoleName.trim()) return;
    const template =
      roleDefinitions.find((r) => r.id === templateRoleId) || roleDefinitions[0];
    const shortLabel = newRoleName
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 5);
    addCustomRole({
      name: newRoleName.trim(),
      department: newRoleDept.trim() || 'Operations',
      shortLabel: shortLabel || 'ROLE',
      colorHex: newRoleColor,
      description: `Custom role modeled on ${template?.name || 'Standard'} with configurable module & approval governance.`,
      approvalLimit: newRoleLimit,
      sidebarModules: [...(template?.sidebarModules || ['dashboard', 'collaboration'])],
      permissions: JSON.parse(JSON.stringify(template?.permissions || { dashboard: ['view'] })),
      isCustom: true,
    });
    setNewRoleName('');
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newUserName.trim()) return;
    addTeamUser({
      name: newUserName.trim(),
      email:
        newUserEmail.trim() ||
        `${newUserName.trim().toLowerCase().replace(/[^a-z0-9]/g, '.')}@aecsolutions.pro`,
      title: newUserTitle.trim() || 'Project Specialist',
      department: newUserDept.trim() || 'Operations',
      team: newUserTeam.trim() || 'Core Team',
      assignedRoles: [newUserRole],
    });
    setNewUserName('');
    setNewUserEmail('');
  };

  const handleToggleUserRole = (userId: string, roleName: UserRole) => {
    if (!isAdmin) return;
    const u = teamUsers.find((usr) => usr.id === userId);
    if (!u) return;
    const has = u.assignedRoles.includes(roleName);
    if (has && u.assignedRoles.length === 1) return; // keep at least one assigned role
    const nextRoles = has
      ? u.assignedRoles.filter((r) => r !== roleName)
      : [...u.assignedRoles, roleName];
    updateTeamUser(userId, { assignedRoles: nextRoles });
  };

  const handleDownloadBackup = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        exportedBy: activeUser?.name || 'Workspace',
        projects: visibleProjects,
        resources,
        companyProfile,
        roleDefinitions,
        teamUsers,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CivilEstimatePro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.resources)) {
        restoreBackup(parsed);
      }
    } catch (err) {
      console.error('Invalid backup JSON:', err);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Settings, Role Management & Governance
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Consultancy branding, unit system, multi-role RBAC permissions, approval limits, team assignments & audit log.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Current Role:</span>
          <RoleBadge role={userRole} />
        </div>
      </div>

      {/* Role Management & Permissions Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-600" />
              <span>Role Management, Module Permissions & Approval Limits</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure module permissions (View / Create / Edit / Approve / Export / Delete), sidebar visibility, and PKR approval thresholds.
            </p>
          </div>
          {!isAdmin && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-300">
              <Lock className="w-3.5 h-3.5" />
              <span>Switch to Admin role to edit role policies</span>
            </div>
          )}
        </div>

        {/* Create Custom Role Bar */}
        {isAdmin && (
          <form
            onSubmit={handleCreateCustomRole}
            className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end text-xs"
          >
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-500 mb-1">Custom Role Name</label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g., QA/QC Inspector"
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-500 mb-1">Department</label>
              <input
                type="text"
                value={newRoleDept}
                onChange={(e) => setNewRoleDept(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Approval Limit ({project.currency})</label>
              <input
                type="number"
                min={-1}
                step={100000}
                value={newRoleLimit}
                onChange={(e) => setNewRoleLimit(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Base Template</label>
              <select
                value={templateRoleId}
                onChange={(e) => setTemplateRoleId(e.target.value)}
                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
              >
                {roleDefinitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <div className="flex items-center gap-1">
                {COLOR_SWATCHES.slice(0, 4).map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setNewRoleColor(hex)}
                    className={`w-4 h-4 rounded-sm border ${
                      newRoleColor === hex
                        ? 'border-slate-900 dark:border-white scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Role</span>
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Role selector list */}
          <div className="lg:col-span-4 space-y-1.5">
            {roleDefinitions.map((role) => {
              const active = role.id === selectedRole?.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md border text-xs transition-colors flex items-center justify-between gap-2 ${
                    active
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={role.name} compact />
                      {role.isCustom && (
                        <span className="text-[10px] font-mono text-slate-400">Custom</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-1">
                      {role.department}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[10px] text-slate-500 shrink-0">
                    {role.approvalLimit < 0
                      ? 'Unlimited'
                      : role.approvalLimit === 0
                      ? 'No Sign-Off'
                      : formatCurrency(role.approvalLimit, project.currency, 0)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Role Permission Matrix */}
          {selectedRole && (
            <div className="lg:col-span-8 space-y-4">
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Department</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={selectedRole.department}
                    onChange={(e) =>
                      updateRoleDefinition(selectedRole.id, { department: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Financial Approval Limit ({project.currency}, -1 = Unlimited)
                  </label>
                  <input
                    type="number"
                    disabled={!isAdmin || selectedRole.name === 'Admin'}
                    value={selectedRole.approvalLimit}
                    onChange={(e) =>
                      updateRoleDefinition(selectedRole.id, {
                        approvalLimit: Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Preview Role View</label>
                  <button
                    type="button"
                    onClick={() => setUserRole(selectedRole.name)}
                    className="w-full px-3 py-1.5 rounded bg-[#0F2137] hover:bg-slate-800 text-white font-medium"
                  >
                    Switch to {selectedRole.shortLabel} Now
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Module</th>
                      <th className="py-2 px-2 text-center font-medium">Sidebar</th>
                      {PERM_ACTIONS.map((act) => (
                        <th key={act} className="py-2 px-2 text-center font-medium capitalize">
                          {act}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MODULE_LABELS.map((mod) => {
                      const inSidebar = selectedRole.sidebarModules.includes(mod.id);
                      const perms = selectedRole.permissions[mod.id] || [];
                      return (
                        <tr key={mod.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                            {mod.label}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              disabled={!isAdmin || selectedRole.name === 'Admin'}
                              checked={inSidebar}
                              onChange={() => handleToggleSidebarModule(mod.id)}
                              className="accent-orange-600"
                            />
                          </td>
                          {PERM_ACTIONS.map((act) => (
                            <td key={act} className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                disabled={!isAdmin || selectedRole.name === 'Admin'}
                                checked={selectedRole.name === 'Admin' || perms.includes(act)}
                                onChange={() => handleTogglePermission(mod.id, act)}
                                className="accent-[#0F2137]"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Team Members, Departments & Multi-Role Assignment */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-600" />
              <span>Team Directory, Departments & Role Assignments ({teamUsers.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assign staff to engineering departments, execution teams, and one or more switchable roles.
            </p>
          </div>
        </div>

        {isAdmin && (
          <form
            onSubmit={handleAddUser}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
          >
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Full Name (e.g., Hassan Raza)"
              className="md:col-span-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="Email"
              className="md:col-span-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={newUserTitle}
              onChange={(e) => setNewUserTitle(e.target.value)}
              placeholder="Job Title"
              className="md:col-span-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={newUserDept}
              onChange={(e) => setNewUserDept(e.target.value)}
              placeholder="Department"
              className="md:col-span-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={newUserTeam}
              onChange={(e) => setNewUserTeam(e.target.value)}
              placeholder="Team"
              className="md:col-span-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
              className="md:col-span-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
            >
              {roleDefinitions.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.shortLabel}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="md:col-span-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 px-3 font-medium">Department</th>
                <th className="py-2 px-3 font-medium">Team</th>
                <th className="py-2 pl-3 font-medium">Assigned Switchable Roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {teamUsers.map((usr) => (
                <tr key={usr.id}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      {usr.avatarUrl ? (
                        <img
                          src={usr.avatarUrl}
                          alt={usr.name}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {usr.name
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() || '')
                            .join('')}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{usr.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {usr.title} · {usr.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={usr.department}
                      onChange={(e) => updateTeamUser(usr.id, { department: e.target.value })}
                      className="w-full max-w-[190px] px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-70"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={usr.team}
                      onChange={(e) => updateTeamUser(usr.id, { team: e.target.value })}
                      className="w-full max-w-[170px] px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-70"
                    />
                  </td>
                  <td className="py-2.5 pl-3">
                    <div className="flex flex-wrap gap-1.5">
                      {roleDefinitions.map((r) => {
                        const assigned = usr.assignedRoles.includes(r.name);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => handleToggleUserRole(usr.id, r.name)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-opacity ${
                              assigned
                                ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                : 'border-dashed border-slate-200 dark:border-slate-800 text-slate-400 opacity-60 hover:opacity-100'
                            }`}
                          >
                            {assigned && <CheckSquare className="w-2.5 h-2.5 text-orange-600" />}
                            <span>{r.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Company Profile + Units & Backup */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Consultancy / Contractor Profile (PDF Cover & Signatures)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Company Name</label>
              <input
                type="text"
                value={companyProfile.companyName}
                onChange={(e) => updateCompanyProfile({ companyName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Engineering License No.</label>
              <input
                type="text"
                value={companyProfile.licenseNo}
                onChange={(e) => updateCompanyProfile({ licenseNo: e.target.value })}
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Office Address</label>
              <input
                type="text"
                value={companyProfile.address}
                onChange={(e) => updateCompanyProfile({ address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Contact Email</label>
              <input
                type="email"
                value={companyProfile.email}
                onChange={(e) => updateCompanyProfile({ email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Contact Phone</label>
              <input
                type="text"
                value={companyProfile.phone}
                onChange={(e) => updateCompanyProfile({ phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Prepared By (Estimator)</label>
              <input
                type="text"
                value={companyProfile.preparedBy}
                onChange={(e) => updateCompanyProfile({ preparedBy: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Reviewed By (QS)</label>
              <input
                type="text"
                value={companyProfile.reviewedBy}
                onChange={(e) => updateCompanyProfile({ reviewedBy: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Approved By (Principal)</label>
              <input
                type="text"
                value={companyProfile.approvedBy}
                onChange={(e) => updateCompanyProfile({ approvedBy: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Workspace Measurement Units
            </h2>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Measurement Unit System</label>
              <select
                value={unitSystem}
                onChange={(e) => setUnitSystem(e.target.value as UnitSystem)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                <option value="imperial">FPS (ft, sq.ft, CFT, lb)</option>
                <option value="metric">Metric SI (m, m², m³, kg)</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Personal Workspace Memory ({activeUser?.name})
              </h2>
              <button
                type="button"
                onClick={() => clearUserMemory(activeUser?.id)}
                className="text-[11px] font-medium text-red-600 hover:underline"
              >
                Reset My Memory
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {visibleProjects.filter((p) => p.visibility === 'private').length}
                </div>
                <div className="text-[10px] text-slate-500">Private Projects</div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {userMemory?.pipelineMappingMemory.length || 0}
                </div>
                <div className="text-[10px] text-slate-500">Learned BOQ Rules</div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {userMemory?.pipelineTemplates.length || 0}
                </div>
                <div className="text-[10px] text-slate-500">Saved Templates</div>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Default New Project Visibility
              </label>
              <select
                value={userMemory?.defaultProjectVisibility || 'team'}
                onChange={(e) =>
                  updateUserMemory({
                    defaultProjectVisibility: e.target.value as 'team' | 'private',
                  })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                <option value="team">Shared Team Workspace</option>
                <option value="private">Private (Isolated to My Account)</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Offline Local Storage &amp; Backup / Restore
            </h2>
            <p className="text-slate-500">
              All accessible projects, markups, WBS schedules, role policies, and personal memory auto-save locally. Export a portable JSON archive anytime.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0F2137] text-white font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JSON Backup</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 font-medium">
                <Upload className="w-3.5 h-3.5 text-orange-600" />
                <span>Restore JSON</span>
                <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </label>
              <button
                type="button"
                onClick={resetDemoData}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Version History & Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Saved Estimate Revisions ({project.revisions.length})
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {project.revisions.map((rev) => (
              <div key={rev.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {rev.versionLabel}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rev.createdAt.slice(0, 10)} · {rev.createdBy} · {rev.notes}
                  </div>
                </div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatCurrency(rev.grandTotal, project.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            System Audit Log (With Role Stamps)
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto text-xs">
            {auditLog.map((entry) => (
              <div key={entry.id} className="py-2.5 flex items-start justify-between gap-3">
                <div>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {entry.action}
                    </span>{' '}
                    <span className="text-slate-500">— {entry.details}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{entry.user}</span>
                    {entry.userRole && <RoleBadge role={entry.userRole} compact />}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {entry.timestamp.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
