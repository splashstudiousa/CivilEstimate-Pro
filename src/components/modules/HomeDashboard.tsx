import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Compass,
  FileSpreadsheet,
  HardHat,
  Layers,
  Lock,
  Plus,
  Ruler,
  ScanLine,
  StickyNote,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  convertArea,
  formatCompactCurrency,
  formatCurrency,
  formatNum,
  getAreaLabel,
} from '../../engine/formatters';
import { PROJECT_TEMPLATES } from '../../data/templates';
import { NavModule, WORK_CATEGORIES } from '../../types/estimate';
import { normalizeRoleName } from '../../data/roles';
import { RoleBadge } from '../common/RoleBadge';
import { TaskBurnUpSummary } from '../common/TaskBurnUpSummary';
import {
  ClientViewerDashboard,
  DraftsmanDashboard,
  FinanceAccountsDashboard,
  ProcurementDashboard,
  ProjectManagerDashboard,
  ProjectPlannerDashboard,
  SiteEngineerDashboard,
  TeamLeaderDashboard,
} from './RoleDashboards';

const DONUT_COLORS = ['#0F2137', '#EA580C', '#0284C7', '#64748B', '#D97706'];

export const HomeDashboard: React.FC = () => {
  const {
    project,
    visibleProjects,
    summary,
    unitSystem,
    userRole,
    activeRoleDef,
    activeUser,
    userMemory,
    isPrivateProject,
  } = useActiveProject();
  const setActiveProject = useEstimateStore((s) => s.setActiveProject);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const createProjectFromTemplate = useEstimateStore((s) => s.createProjectFromTemplate);
  const updateUserMemory = useEstimateStore((s) => s.updateUserMemory);
  const [projectFilter, setProjectFilter] = React.useState<'all' | 'private' | 'team'>('all');

  const normalizedRole = normalizeRoleName(userRole);
  if (normalizedRole === 'Project Manager') return <ProjectManagerDashboard />;
  if (normalizedRole === 'Project Planner') return <ProjectPlannerDashboard />;
  if (normalizedRole === 'Team Leader') return <TeamLeaderDashboard />;
  if (normalizedRole === 'Draftsman/CAD Technician') return <DraftsmanDashboard />;
  if (normalizedRole === 'Finance/Accounts') return <FinanceAccountsDashboard />;
  if (normalizedRole === 'Site Engineer') return <SiteEngineerDashboard />;
  if (normalizedRole === 'Procurement') return <ProcurementDashboard />;
  if (normalizedRole === 'Client/Viewer') return <ClientViewerDashboard />;

  // Custom roles map cleanly by department if not Admin or Estimator/QS
  if (normalizedRole !== 'Admin' && normalizedRole !== 'Estimator/QS') {
    const dept = (activeRoleDef?.department || '').toLowerCase();
    if (dept.includes('planning')) return <ProjectPlannerDashboard />;
    if (dept.includes('design') || dept.includes('cad')) return <DraftsmanDashboard />;
    if (dept.includes('finance') || dept.includes('commercial')) return <FinanceAccountsDashboard />;
    if (dept.includes('procurement') || dept.includes('supply')) return <ProcurementDashboard />;
    if (dept.includes('field') || dept.includes('site') || dept.includes('construction')) {
      return <SiteEngineerDashboard />;
    }
    if (dept.includes('executive') || dept.includes('management')) return <ProjectManagerDashboard />;
  }

  const allowedSet = new Set(activeRoleDef.sidebarModules);
  const canOpen = (mod: NavModule) => normalizedRole === 'Admin' || allowedSet.has(mod);
  const isQSEstimator = normalizedRole === 'Estimator/QS';
  const visibleAlerts = summary.alerts.filter((a) => canOpen(a.module));

  const areaConverted = convertArea(project.builtUpArea, unitSystem);
  const costPerArea = areaConverted > 0 ? summary.grandTotal / areaConverted : 0;

  const donutData = [
    { name: 'Materials', value: Math.round(summary.materialCost) },
    { name: 'Labor', value: Math.round(summary.laborCost) },
    { name: 'Equipment', value: Math.round(summary.equipmentCost) },
    {
      name: 'Overhead & Profit',
      value: Math.round(summary.overheadAmount + summary.profitAmount),
    },
    {
      name: 'Tax, Cont. & Esc.',
      value: Math.round(
        summary.taxAmount + summary.contingencyAmount + summary.escalationAmount
      ),
    },
  ].filter((d) => d.value > 0);

  const categoryBarData = WORK_CATEGORIES.map((cat) => ({
    category: cat,
    cost: Math.round(summary.categoryTotals[cat].directCost),
  }))
    .filter((d) => d.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);

  const pendingTasks = summary.tasks.filter((t) => t.actualProgressPct < 100).slice(0, 6);
  const currentPipelineStage = (project.workflowHandoffs || []).find(
    (s) => s.status === 'In Progress' || s.status === 'Under Review' || s.status === 'Submitted'
  );

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <RoleBadge role={userRole} />
            <span aria-hidden="true">·</span>
            <span>{project.code}</span>
            <span aria-hidden="true">·</span>
            <span>{project.country || 'Pakistan'}</span>
            <span aria-hidden="true">·</span>
            <span>{project.type}</span>
            <span aria-hidden="true">·</span>
            <span>{project.rateSchedule}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {project.approvalStatus}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
              {isPrivateProject ? (
                <>
                  <Lock className="w-3 h-3 text-orange-600" />
                  <span>Private ({project.ownerName || activeUser?.name || 'Owner'})</span>
                </>
              ) : (
                <>
                  <Users className="w-3 h-3 text-sky-600" />
                  <span>Shared Team</span>
                </>
              )}
            </span>
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {project.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canOpen('takeoff') && (
            <button
              type="button"
              onClick={() => setActiveModule('takeoff')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5 text-orange-600" />
              <span>Drawing Takeoff</span>
            </button>
          )}
          {isQSEstimator && canOpen('pipeline') && (
            <button
              type="button"
              onClick={() => setActiveModule('pipeline')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <ScanLine className="w-3.5 h-3.5 text-teal-600" />
              <span>Drawing to Estimate</span>
            </button>
          )}
          {canOpen('measurements') && (
            <button
              type="button"
              onClick={() => setActiveModule('measurements')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Ruler className="w-3.5 h-3.5 text-sky-600" />
              <span>Measurement Sheet</span>
            </button>
          )}
          {canOpen('abstract-cost') && (
            <button
              type="button"
              onClick={() => setActiveModule('abstract-cost')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Open Abstract of Cost</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Governance Strip */}
      {normalizedRole === 'Admin' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300">
            <div>
              Active Pipeline Stage:{' '}
              <strong className="text-slate-900 dark:text-white">
                {currentPipelineStage?.stageName || 'All Stages Complete'}
              </strong>
            </div>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <div>
              Open Team Tasks:{' '}
              <strong className="font-mono text-slate-900 dark:text-white">
                {(project.teamTasks || []).filter((t) => t.status !== 'Completed').length}
              </strong>
            </div>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <div>
              EVM Health:{' '}
              <strong className="font-mono text-slate-900 dark:text-white">
                SPI {summary.evm.spi.toFixed(2)} · CPI {summary.evm.cpi.toFixed(2)}
              </strong>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('planner')}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
            >
              Project Planner
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('collaboration')}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
            >
              Workflow Pipeline
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              className="px-2.5 py-1.5 rounded bg-[#0F2137] text-white font-medium hover:bg-slate-800"
            >
              Role Management
            </button>
          </div>
        </div>
      )}

      {/* KPI Strip (6 Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Estimated Cost
          </div>
          <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatCompactCurrency(summary.grandTotal, project.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Direct: {formatCompactCurrency(summary.directCost, project.currency)}
          </div>
        </div>

        {isQSEstimator ? (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                BOQ &amp; Takeoff Lines
              </div>
              <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.items.length} <span className="text-sm font-normal">BOQ items</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {project.measurements.length} measurement lines
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Labor &amp; Equipment
              </div>
              <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {formatCompactCurrency(summary.laborCost + summary.equipmentCost, project.currency)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {formatNum(summary.totalLaborManDays, 0)} man-days · {formatNum(summary.totalEquipmentHours, 0)} eq. hrs
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Duration
              </div>
              <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.totalDurationWorkingDays} <span className="text-sm font-normal">days</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {summary.totalDurationCalendarDays} calendar days
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Labor Days
              </div>
              <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {formatNum(summary.totalLaborManDays, 0)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {formatCompactCurrency(summary.laborCost, project.currency)} labor cost
              </div>
            </div>
          </>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Material Cost
          </div>
          <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatCompactCurrency(summary.materialCost, project.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {summary.directCost > 0
              ? `${((summary.materialCost / summary.directCost) * 100).toFixed(1)}% of direct`
              : '0%'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Contingency Reserve
          </div>
          <div className="mt-1.5 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatCompactCurrency(summary.contingencyAmount, project.currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {project.contingencyPct}% of direct cost
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cost per {getAreaLabel(unitSystem)}
          </div>
          <div className="mt-1.5 text-xl font-mono font-bold text-orange-600 dark:text-orange-400 tabular-nums">
            {formatCurrency(costPerArea, project.currency, 0)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Area: {formatNum(areaConverted, 0)} {getAreaLabel(unitSystem)}
          </div>
        </div>
      </div>

      {/* Task Burn-Up Summary View (Executive / Admin / Schedule roles; hidden for pure QS Estimating) */}
      {!isQSEstimator && (
        <TaskBurnUpSummary
          tasks={summary.tasks}
          statusDay={summary.evm.statusDay}
          totalWorkingDays={summary.totalDurationWorkingDays}
          startDate={project.startDate}
          workingDaysPerWeek={project.calendar.workingDaysPerWeek}
          onOpenSchedule={canOpen('timeline') ? () => setActiveModule('timeline') : undefined}
          onOpenSetup={canOpen('setup') ? () => setActiveModule('setup') : undefined}
        />
      )}

      {/* Charts Grid Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Cost Breakdown Donut */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Cost Breakdown Structure
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Materials, labor, equipment & markups
              </p>
            </div>
            {canOpen('abstract-cost') && (
              <button
                type="button"
                onClick={() => setActiveModule('abstract-cost')}
                className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400"
              >
                Details →
              </button>
            )}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={86}
                  paddingAngle={2}
                >
                  {donutData.map((_, idx) => (
                    <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value ?? 0), project.currency)}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost by Work Category Bar */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Direct Cost by Work Category
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Top engineering trades ranked by estimated cost
              </p>
            </div>
            {canOpen('abstract-quantities') && (
              <button
                type="button"
                onClick={() => setActiveModule('abstract-quantities')}
                className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400"
              >
                Quantities →
              </button>
            )}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBarData} margin={{ top: 8, right: 16, left: 4, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => formatCompactCurrency(v, project.currency)}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value ?? 0), project.currency)}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="cost" fill="#1E3A5F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid Row 2: S-Curve & Manpower Histogram (Executive / Admin view) */}
      {!isQSEstimator && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Project S-Curve (Cumulative Cost vs Time)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Planned cumulative baseline vs earned actual expenditure
                </p>
              </div>
              {canOpen('timeline') && (
                <button
                  type="button"
                  onClick={() => setActiveModule('timeline')}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400"
                >
                  Open Gantt →
                </button>
              )}
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.cashFlow} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(v) => formatCompactCurrency(v, project.currency)}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0), project.currency)}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="plannedCumulativeCost"
                    name="Planned Cumulative"
                    stroke="#0F2137"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualCumulativeCost"
                    name="Actual Earned"
                    stroke="#EA580C"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Manpower Histogram
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily/weekly workforce demand across active schedule
                </p>
              </div>
              {canOpen('labor-equipment') && (
                <button
                  type="button"
                  onClick={() => setActiveModule('labor-equipment')}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400"
                >
                  Labor Sheet →
                </button>
              )}
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary.manpowerHistogram.slice(0, 16)}
                  margin={{ top: 8, right: 10, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value ?? 0)} workers/day`, 'Site Crew']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="workers" fill="#EA580C" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Operational Panel: Alerts, (Pending Tasks for Admin), Projects & Quick Templates */}
      <div className={`grid grid-cols-1 ${isQSEstimator ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-5`}>
        {/* Alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {isQSEstimator ? 'Estimating & Rate Alerts' : 'Diagnostic Alerts'}
            </h2>
            <span className="text-xs font-mono text-slate-500">{visibleAlerts.length}</span>
          </div>
          <div className="space-y-2.5 flex-1">
            {visibleAlerts.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">
                No missing quantities or outdated resource rates detected.
              </div>
            ) : (
              visibleAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setActiveModule(alert.module)}
                  className="w-full text-left p-3 rounded-md border border-slate-200 dark:border-slate-800 hover:border-orange-500/50 transition-colors flex items-start gap-2.5"
                >
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      alert.severity === 'error'
                        ? 'text-red-600'
                        : alert.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-sky-600'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {alert.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {alert.description}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Pending Tasks (Executive / Admin view only; hidden for Estimator/QS) */}
        {!isQSEstimator && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Active & Pending Work Packages
              </h2>
              {canOpen('timeline') && (
                <button
                  type="button"
                  onClick={() => setActiveModule('timeline')}
                  className="text-xs text-orange-600 hover:underline font-medium"
                >
                  Schedule →
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1">
              {pendingTasks.map((t) => (
                <div key={t.boqItemId} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {t.itemNo} {t.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{t.category}</span>
                      <span>·</span>
                      <span className="font-mono">
                        Day {t.earlyStart + 1}–{t.earlyFinish}
                      </span>
                      {t.isCritical && (
                        <>
                          <span>·</span>
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            Critical
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                    {t.actualProgressPct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Projects & Quick Start Templates */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Projects &amp; Quick Templates
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  createProjectFromTemplate(
                    PROJECT_TEMPLATES[0].id,
                    `${activeUser?.name.split(' ')[0] || 'My'} Private Estimate`,
                    project.country,
                    'private'
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:underline"
              >
                <Lock className="w-3 h-3" />
                <span>New Private</span>
              </button>
              {canOpen('setup') && (
                <button
                  type="button"
                  onClick={() => setActiveModule('setup')}
                  className="text-xs text-slate-500 hover:text-orange-600 hover:underline font-medium"
                >
                  Manage →
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 p-0.5 mb-3 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
            {(
              [
                { id: 'all', label: `All (${visibleProjects.length})` },
                {
                  id: 'private',
                  label: `My Private (${visibleProjects.filter((p) => p.visibility === 'private').length})`,
                },
                {
                  id: 'team',
                  label: `Shared (${visibleProjects.filter((p) => p.visibility !== 'private').length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setProjectFilter(tab.id)}
                className={`flex-1 py-1 px-2 rounded font-medium transition-colors ${
                  projectFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 mb-4">
            {visibleProjects
              .filter((p) =>
                projectFilter === 'all'
                  ? true
                  : projectFilter === 'private'
                  ? p.visibility === 'private'
                  : p.visibility !== 'private'
              )
              .slice(0, 3)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProject(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors flex items-center justify-between gap-2 ${
                    p.id === project.id
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      {p.visibility === 'private' && (
                        <Lock className="w-3 h-3 text-orange-600 shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {p.code} · {p.visibility === 'private' ? 'Private' : 'Shared'} · {p.type}
                    </div>
                  </div>
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
          </div>

          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Start From Engineering Template
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => createProjectFromTemplate(tpl.id)}
                className="text-left p-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:border-orange-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Plus className="w-3 h-3 text-orange-600 shrink-0" />
                  <span className="truncate">{tpl.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{tpl.areaLabel}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Personal Workspace Memory & Private Scratchpad */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-orange-600" />
              <span>Personal Workspace Memory — {activeUser?.name}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Private estimating scratchpad, last active project, unit preference, and learned BOQ rules isolated to your profile.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-mono">
              Private Projects: <strong className="text-slate-900 dark:text-white">{visibleProjects.filter((p) => p.visibility === 'private').length}</strong> · BOQ Rules: <strong className="text-slate-900 dark:text-white">{userMemory?.pipelineMappingMemory.length || 0}</strong>
            </span>
            <select
              aria-label="Default visibility for new projects"
              value={userMemory?.defaultProjectVisibility || 'team'}
              onChange={(e) =>
                updateUserMemory({
                  defaultProjectVisibility: e.target.value as 'team' | 'private',
                })
              }
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="team">Default New: Shared Team</option>
              <option value="private">Default New: Private Only</option>
            </select>
          </div>
        </div>
        <textarea
          rows={2}
          value={userMemory?.personalNotes || ''}
          onChange={(e) => updateUserMemory({ personalNotes: e.target.value })}
          placeholder="Write private rate assumptions, vendor follow-ups, or takeoff notes visible only when signed in as this user..."
          className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Quick Resource Summary Footer Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-5 text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span>
              BOQ Items: <strong className="font-mono text-slate-900 dark:text-white">{summary.items.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-slate-400" />
            <span>
              Measurement Lines:{' '}
              <strong className="font-mono text-slate-900 dark:text-white">{project.measurements.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <HardHat className="w-4 h-4 text-slate-400" />
            <span>
              Equipment Hours:{' '}
              <strong className="font-mono text-slate-900 dark:text-white">
                {formatNum(summary.totalEquipmentHours, 0)} hrs
              </strong>
            </span>
          </div>
        </div>
        <div className="text-slate-500 dark:text-slate-400 font-mono">
          Grand Total in Words: <span className="text-slate-800 dark:text-slate-200">{summary.grandTotalInWords}</span>
        </div>
      </div>
    </div>
  );
};
