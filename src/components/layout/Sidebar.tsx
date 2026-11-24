import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  CalendarRange,
  Compass,
  FileSpreadsheet,
  FileText,
  FolderCog,
  GanttChartSquare,
  GitPullRequestDraft,
  HardHat,
  Layers,
  LayoutDashboard,
  Package,
  Ruler,
  ScanLine,
  Settings,
  X,
} from 'lucide-react';
import { NavModule } from '../../types/estimate';
import { useEstimateStore } from '../../store/useEstimateStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { RoleBadge } from '../common/RoleBadge';

interface NavGroup {
  label: string;
  items: Array<{ id: NavModule; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Role Workspace',
    items: [
      { id: 'dashboard', label: 'Role Dashboard', icon: LayoutDashboard },
      { id: 'collaboration', label: 'Workflow & Tasks', icon: GitPullRequestDraft },
      { id: 'setup', label: 'Project Setup', icon: FolderCog },
    ],
  },
  {
    label: 'Design & Estimating',
    items: [
      { id: 'takeoff', label: 'Drawing Takeoff', icon: Compass },
      { id: 'pipeline', label: 'Drawing to Estimate', icon: ScanLine },
      { id: 'measurements', label: 'Measurement Sheet', icon: Ruler },
      { id: 'rate-analysis', label: 'Rate Analysis', icon: Calculator },
      { id: 'abstract-quantities', label: 'Abstract of Quantities', icon: Layers },
      { id: 'abstract-cost', label: 'Abstract of Cost (BOQ)', icon: FileSpreadsheet },
      { id: 'unit-converter', label: 'Unit Converter', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Planning & Resources',
    items: [
      { id: 'planner', label: 'Project Planner', icon: GanttChartSquare },
      { id: 'timeline', label: 'Time & Gantt View', icon: CalendarRange },
      { id: 'materials', label: 'Material Schedule', icon: Package },
      { id: 'labor-equipment', label: 'Labor & Equipment', icon: HardHat },
    ],
  },
  {
    label: 'Reports & Governance',
    items: [
      { id: 'reports', label: 'Reports & Export', icon: FileText },
      { id: 'settings', label: 'Settings & Roles', icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const activeModule = useEstimateStore((s) => s.activeModule);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const companyName = useEstimateStore((s) => s.companyProfile.companyName);
  const { project, userRole, activeRoleDef } = useActiveProject();

  const allowedSet = new Set(activeRoleDef.sidebarModules);
  const roleTaskCount = (project.teamTasks || []).filter(
    (t) =>
      t.status !== 'Completed' &&
      (userRole === 'Admin' || userRole === 'Project Manager' || t.assigneeRole === userRole)
  ).length;

  const handleSelect = (id: NavModule) => {
    setActiveModule(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#0F2137] text-slate-100 border-r border-slate-800/80 select-none">
      {/* Brand Zone */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/90 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden flex items-center justify-center">
            <img
              src="/src/assets/images/company_emblem_1795496552579.jpg"
              alt="CivilEstimate Pro"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-white truncate">
              CivilEstimate Pro
            </div>
            <div className="text-[11px] text-slate-400 truncate">{companyName}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Active Role Context Strip */}
      <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-slate-400">Active View</span>
          <RoleBadge role={userRole} compact />
        </div>
        <div className="text-xs font-semibold text-slate-100 truncate mt-0.5">
          {userRole}
        </div>
        <div className="text-[10px] text-slate-400 truncate">{activeRoleDef.department}</div>
      </div>

      {/* Role-Filtered Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (it) => userRole === 'Admin' || allowedSet.has(it.id)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium text-slate-400 tracking-wide">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  const showCount = item.id === 'collaboration' && roleTaskCount > 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                        isActive
                          ? 'bg-orange-600 text-white shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {showCount && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-orange-400'
                          }`}
                        >
                          {roleTaskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom Quick Action */}
      {allowedSet.has('reports') && (
        <div className="p-3 border-t border-slate-800/90 shrink-0">
          <button
            type="button"
            onClick={() => handleSelect('reports')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Export Reports Package</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 z-30">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
};
