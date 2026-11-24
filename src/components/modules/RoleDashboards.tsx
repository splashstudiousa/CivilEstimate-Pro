import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  FolderKanban,
  GanttChartSquare,
  HardHat,
  Layers,
  Lock,
  Mic,
  Package,
  Plus,
  Receipt,
  ShieldAlert,
  Truck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { exportReportToExcel, exportReportToPDF } from '../../engine/exporters';
import {
  DailySiteReport,
  DrawingRegisterItem,
  QAChecklistItem,
  RABill,
  TeamTaskItem,
} from '../../types/estimate';
import { RoleBadge } from '../common/RoleBadge';
import { TaskBurnUpSummary } from '../common/TaskBurnUpSummary';
import {
  DictationTargetField,
  VoiceDictationControl,
} from '../common/VoiceDictationControl';

const DashboardHeader: React.FC<{
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => {
  const { project, userRole } = useActiveProject();
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <RoleBadge role={userRole} />
          <span aria-hidden="true">·</span>
          <span>{project.code}</span>
          <span aria-hidden="true">·</span>
          <span>{project.country || 'Pakistan'}</span>
          <span aria-hidden="true">·</span>
          <span>{project.name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {project.approvalStatus}
          </span>
        </div>
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight mt-1">
          {title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};

/* ============================================================================
   1. PROJECT MANAGER DASHBOARD
============================================================================ */
export const ProjectManagerDashboard: React.FC = () => {
  const { project, summary } = useActiveProject();
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const updateProjectApprovalStatus = useEstimateStore((s) => s.updateProjectApprovalStatus);
  const updateRABillStatus = useEstimateStore((s) => s.updateRABillStatus);

  const risks = project.risksAndDelays || [];
  const openRisks = risks.filter((r) => r.status === 'Open');
  const pendingBills = (project.raBills || []).filter(
    (b) => b.status === 'Submitted' || b.status === 'Under Review'
  );
  const tasks = project.teamTasks || [];
  const deptWorkload = ['Site Execution Crews', 'Design & CAD Studio', 'Cost & Quantity Surveying', 'Finance & Commercial', 'Supply Chain & Purchasing'].map(
    (dept) => ({
      department: dept.split(' ')[0],
      active: tasks.filter((t) => t.department === dept && t.status !== 'Completed').length,
      done: tasks.filter((t) => t.department === dept && t.status === 'Completed').length,
    })
  );

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Project Manager — Delivery & Executive Health"
        subtitle="Overall cost, schedule, milestones, pending approvals, team workload & risk governance."
        actions={
          <>
            <button
              type="button"
              onClick={() => setActiveModule('planner')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
            >
              <GanttChartSquare className="w-3.5 h-3.5 text-orange-600" />
              <span>Open Master Schedule</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('collaboration')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
            >
              <span>Workflow & Approvals</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          {
            label: 'Budget (BAC)',
            value: formatCompactCurrency(summary.grandTotal, project.currency),
            sub: `EAC: ${formatCompactCurrency(summary.evm.eac, project.currency)}`,
          },
          {
            label: 'Earned vs Actual',
            value: `${summary.evm.overallProgressPct.toFixed(1)}%`,
            sub: `CPI ${summary.evm.cpi.toFixed(2)} · SPI ${summary.evm.spi.toFixed(2)}`,
          },
          {
            label: 'Schedule Health',
            value: `${summary.totalDurationWorkingDays}d`,
            sub: `Forecast: ${summary.evm.forecastWorkingDays}d`,
          },
          {
            label: 'Pending Approvals',
            value: `${pendingBills.length + (project.approvalStatus === 'Under Review' ? 1 : 0)}`,
            sub: 'Estimate & RA Certificates',
          },
          {
            label: 'Open Risk Exposure',
            value: `${openRisks.length} open`,
            sub: `+${openRisks.reduce((s, r) => s + r.impactDays, 0)}d potential slip`,
          },
          {
            label: 'Active Crew Tasks',
            value: `${tasks.filter((t) => t.status !== 'Completed').length}`,
            sub: `${tasks.filter((t) => t.status === 'Blocked').length} blocked`,
          },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4"
          >
            <div className="text-[11px] font-medium text-slate-500">{k.label}</div>
            <div className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-1">
              {k.value}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Budget vs Actual S-Curve + Team Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Budget vs Earned vs Actual Cost (S-Curve)
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Live tracking across {project.name}
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.cashFlow} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => formatCompactCurrency(v, project.currency)}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v ?? 0), project.currency)}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="plannedCumulativeCost" name="Budget (PV)" stroke="#0F2137" fill="#1E3A5F" fillOpacity={0.14} strokeWidth={2} />
                <Area type="monotone" dataKey="earnedCumulativeCost" name="Earned (EV)" stroke="#16A34A" fill="#16A34A" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="actualCumulativeCost" name="Actual (AC)" stroke="#EA580C" fill="#EA580C" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Department Team Workload
          </h2>
          <p className="text-xs text-slate-500 mb-3">Open vs completed deliverables across teams</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptWorkload} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="active" name="Open Tasks" fill="#EA580C" radius={[3, 3, 0, 0]} />
                <Bar dataKey="done" name="Completed" fill="#0F2137" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Task Burn-Up Summary View */}
      <TaskBurnUpSummary
        tasks={summary.tasks}
        statusDay={summary.evm.statusDay}
        totalWorkingDays={summary.totalDurationWorkingDays}
        startDate={project.startDate}
        workingDaysPerWeek={project.calendar.workingDaysPerWeek}
        onOpenSchedule={() => setActiveModule('planner')}
        onOpenSetup={() => setActiveModule('setup')}
      />

      {/* Pending Approvals + Risk Register + Weekly Progress Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Pending Executive Approvals
          </h2>
          <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Master Estimate ({project.approvalStatus})
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {formatCurrency(summary.grandTotal, project.currency)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateProjectApprovalStatus('Approved', 'Approved by Project Manager')}
                className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => updateProjectApprovalStatus('Revision Requested', 'PM requested revision')}
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 text-[11px]"
              >
                Revise
              </button>
            </div>
          </div>

          {(project.raBills || []).map((b) => (
            <div
              key={b.id}
              className="p-3 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {b.billNo} · {b.status}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Net {formatCurrency(b.netPayable, project.currency)}
                </div>
              </div>
              {b.status !== 'Approved' && b.status !== 'Paid' && (
                <button
                  type="button"
                  onClick={() => updateRABillStatus(b.id, 'Approved')}
                  className="px-2.5 py-1 rounded bg-[#0F2137] text-white text-[11px] font-semibold"
                >
                  Certify
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Active Risk Register & Weekly Progress Snapshot
            </h2>
            <button
              type="button"
              onClick={() => setActiveModule('planner')}
              className="text-xs font-medium text-orange-600 hover:underline"
            >
              Manage in Planner →
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {risks.slice(0, 4).map((rk) => (
              <div key={rk.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{rk.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {rk.category} · Owner: {rk.owner} · Mitigation: {rk.mitigation}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-semibold text-orange-600 shrink-0">
                  +{rk.impactDays}d · {rk.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. PROJECT PLANNER DASHBOARD
============================================================================ */
export const ProjectPlannerDashboard: React.FC = () => {
  const { project, summary } = useActiveProject();
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const criticalTasks = summary.tasks.filter((t) => t.isCritical);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Project Planner — Controls, Critical Path & Look-Ahead"
        subtitle="Master schedule status, EVM indicators, resource loading, baseline variance & what-if scenarios."
        actions={
          <button
            type="button"
            onClick={() => setActiveModule('planner')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
          >
            <GanttChartSquare className="w-4 h-4" />
            <span>Open Full WBS & Gantt Workspace</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Master Working Duration', value: `${summary.totalDurationWorkingDays}d`, sub: `${criticalTasks.length} Critical Path items` },
          { label: 'SPI (Schedule Efficiency)', value: summary.evm.spi.toFixed(2), sub: `Forecast ${summary.evm.forecastWorkingDays}d` },
          { label: 'CPI (Cost Efficiency)', value: summary.evm.cpi.toFixed(2), sub: `EAC ${formatCompactCurrency(summary.evm.eac, project.currency)}` },
          { label: 'Resource Over-Allocations', value: `${summary.overAllocatedBuckets} periods`, sub: 'Periods above 16 crew/day' },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-500">{k.label}</div>
            <div className="text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-1">{k.value}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Critical Path Activities (Zero Float)
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {criticalTasks.map((t) => (
              <div key={t.boqItemId} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    <span className="font-mono text-orange-600 mr-1.5">{t.itemNo}</span>
                    {t.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Window: D{t.earlyStart + 1}–D{t.earlyFinish} · Baseline: D{t.baselineStartDay + 1}–D{t.baselineStartDay + t.baselineDurationDays}
                  </div>
                </div>
                <span className="font-mono font-bold shrink-0">{t.actualProgressPct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Resource Loading Histogram
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.manpowerHistogram} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', fontSize: '12px' }} />
                <Bar dataKey="workers" name="Crew / Day" fill="#0284C7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <TaskBurnUpSummary
        tasks={summary.tasks}
        statusDay={summary.evm.statusDay}
        totalWorkingDays={summary.totalDurationWorkingDays}
        startDate={project.startDate}
        workingDaysPerWeek={project.calendar.workingDaysPerWeek}
        onOpenSchedule={() => setActiveModule('planner')}
        onOpenSetup={() => setActiveModule('setup')}
      />
    </div>
  );
};

/* ============================================================================
   3. TEAM LEADER DASHBOARD (KANBAN + ATTENDANCE + TARGETS)
============================================================================ */
export const TeamLeaderDashboard: React.FC = () => {
  const { project } = useActiveProject();
  const updateTeamTask = useEstimateStore((s) => s.updateTeamTask);
  const addTeamTask = useEstimateStore((s) => s.addTeamTask);
  const addAttendanceRecord = useEstimateStore((s) => s.addAttendanceRecord);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [attTeam, setAttTeam] = useState('Masonry & Concrete Gang');
  const [attPresent, setAttPresent] = useState(9);
  const [attPlanned, setAttPlanned] = useState(10);

  const tasks = project.teamTasks || [];
  const attendance = project.manpowerAttendance || [];
  const columns: TeamTaskItem['status'][] = ['Backlog', 'In Progress', 'Blocked', 'Completed'];

  const totalPlannedWorkers = attendance.reduce((s, a) => s + a.plannedWorkers, 0);
  const totalPresentWorkers = attendance.reduce((s, a) => s + a.presentWorkers, 0);
  const attendancePct = totalPlannedWorkers > 0 ? Math.round((totalPresentWorkers / totalPlannedWorkers) * 100) : 100;

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Team Leader — Crew Task Board & Daily Targets"
        subtitle="Kanban execution board, daily crew output targets, trade attendance & field blockers."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Assigned Active Tasks</div>
          <div className="text-xl font-mono font-bold mt-1">{tasks.filter((t) => t.status !== 'Completed').length}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Crew Attendance Today</div>
          <div className="text-xl font-mono font-bold mt-1">{totalPresentWorkers}/{totalPlannedWorkers} ({attendancePct}%)</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Blocked / Issues Raised</div>
          <div className="text-xl font-mono font-bold text-orange-600 mt-1">{tasks.filter((t) => t.status === 'Blocked').length}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Daily Target Achievement</div>
          <div className="text-xl font-mono font-bold text-emerald-600 mt-1">88%</div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-orange-600" />
            <span>Crew Execution Kanban Board</span>
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add crew task..."
              className="w-52 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <button
              type="button"
              onClick={() => {
                if (!newTaskTitle.trim()) return;
                addTeamTask({
                  title: newTaskTitle.trim(),
                  description: 'Site crew daily target',
                  status: 'Backlog',
                  priority: 'High',
                  assignedTo: 'Bilal Tariq',
                  assigneeRole: 'Team Leader',
                  department: 'Site Execution Crews',
                  dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
                });
                setNewTaskTitle('');
              }}
              className="px-3 py-1.5 rounded bg-orange-600 text-white font-semibold"
            >
              Add Task
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <div
                key={col}
                className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>{col}</span>
                  <span className="font-mono text-slate-500">{colTasks.length}</span>
                </div>
                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">{t.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.assignedTo} · Due {t.dueDate}
                    </div>
                    {t.dailyTargetQty && (
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                        Target: {t.executedTodayQty ?? 0} / {t.dailyTargetQty} {t.unit}
                      </div>
                    )}
                    <select
                      value={t.status}
                      onChange={(e) =>
                        updateTeamTask(t.id, { status: e.target.value as TeamTaskItem['status'] })
                      }
                      className="w-full px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    >
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          Move to: {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manpower Attendance Log */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-600" />
            <span>Manpower Attendance Register</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={attTeam}
              onChange={(e) => setAttTeam(e.target.value)}
              className="w-44 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="number"
              min={1}
              value={attPresent}
              onChange={(e) => setAttPresent(Number(e.target.value) || 0)}
              className="w-14 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              title="Present"
            />
            <span className="text-slate-400">/</span>
            <input
              type="number"
              min={1}
              value={attPlanned}
              onChange={(e) => setAttPlanned(Number(e.target.value) || 1)}
              className="w-14 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              title="Planned"
            />
            <button
              type="button"
              onClick={() =>
                addAttendanceRecord({
                  date: new Date().toISOString().slice(0, 10),
                  teamName: attTeam,
                  foreman: 'Shift Foreman',
                  trade: 'Civil Crew',
                  plannedWorkers: attPlanned,
                  presentWorkers: attPresent,
                  remarks: 'Logged by Team Leader',
                })
              }
              className="px-3 py-1 rounded bg-[#0F2137] text-white font-semibold"
            >
              Log Attendance
            </button>
          </div>
        </div>

        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Date</th>
              <th className="text-left px-3 py-2 font-semibold">Gang / Trade</th>
              <th className="text-left px-3 py-2 font-semibold">Foreman</th>
              <th className="text-right px-3 py-2 font-semibold">Present / Planned</th>
              <th className="text-left px-3 py-2 font-semibold">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {attendance.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 font-mono">{a.date}</td>
                <td className="px-3 py-2 font-medium">{a.teamName} ({a.trade})</td>
                <td className="px-3 py-2">{a.foreman}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {a.presentWorkers} / {a.plannedWorkers}
                </td>
                <td className="px-3 py-2 text-slate-500">{a.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================================================================
   4. DRAFTSMAN / CAD TECHNICIAN DASHBOARD
============================================================================ */
export const DraftsmanDashboard: React.FC = () => {
  const { project } = useActiveProject();
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const addDrawingRegisterItem = useEstimateStore((s) => s.addDrawingRegisterItem);
  const updateDrawingRegisterItem = useEstimateStore((s) => s.updateDrawingRegisterItem);
  const fulfillDrawingRequest = useEstimateStore((s) => s.fulfillDrawingRequest);

  const [newDrwNo, setNewDrwNo] = useState('AR-SEC-01');
  const [newDrwTitle, setNewDrwTitle] = useState('');
  const [newDrwDisc, setNewDrwDisc] = useState<DrawingRegisterItem['discipline']>('Architectural');

  const reg = project.drawingRegister || [];
  const reqs = project.drawingRequests || [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Draftsman / CAD Studio — Drawing Register & Revision Control"
        subtitle="Manage Rev A/B/C releases, IFC approvals, transmittals & pending estimator drawing requests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('pipeline')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#0F2137] hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <span>Run Drawing-to-Estimate</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('takeoff')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
            >
              <span>Open Drawing Takeoff Viewer</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Total Controlled Drawings</div>
          <div className="text-xl font-mono font-bold mt-1">{reg.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Issued For Construction (IFC)</div>
          <div className="text-xl font-mono font-bold text-emerald-600 mt-1">
            {reg.filter((d) => d.status === 'IFC').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Under Review / Draft</div>
          <div className="text-xl font-mono font-bold mt-1">
            {reg.filter((d) => d.status === 'Draft' || d.status === 'Under Review').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Pending Estimator Requests</div>
          <div className="text-xl font-mono font-bold text-orange-600 mt-1">
            {reqs.filter((r) => r.status !== 'Issued').length}
          </div>
        </div>
      </div>

      {/* Drawing Register */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Master Drawing Register & Transmittal Log
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={newDrwNo}
              onChange={(e) => setNewDrwNo(e.target.value)}
              className="w-28 px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={newDrwTitle}
              onChange={(e) => setNewDrwTitle(e.target.value)}
              placeholder="Drawing title..."
              className="w-48 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <select
              value={newDrwDisc}
              onChange={(e) => setNewDrwDisc(e.target.value as DrawingRegisterItem['discipline'])}
              className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            >
              <option value="Architectural">Architectural</option>
              <option value="Structural">Structural</option>
              <option value="MEP">MEP</option>
              <option value="Civil">Civil</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (!newDrwTitle.trim()) return;
                addDrawingRegisterItem({
                  drawingNo: newDrwNo || 'DRW-06',
                  title: newDrwTitle.trim(),
                  discipline: newDrwDisc,
                  currentRev: 'Rev A',
                  status: 'Draft',
                  draftsman: 'Sana Qureshi',
                  transmittalNo: `TRN-00${reg.length + 1}`,
                  updatedAt: new Date().toISOString().slice(0, 10),
                  reviewComments: 'New sheet registered for review.',
                  revisions: [
                    {
                      rev: 'Rev A',
                      date: new Date().toISOString().slice(0, 10),
                      by: 'Sana Qureshi',
                      notes: 'Initial CAD issue',
                      status: 'Draft',
                    },
                  ],
                });
                setNewDrwTitle('');
              }}
              className="px-3 py-1.5 rounded bg-[#0F2137] text-white font-semibold"
            >
              Register Sheet
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Drawing No</th>
                <th className="text-left px-3 py-2 font-semibold">Title & Comments</th>
                <th className="text-left px-3 py-2 font-semibold">Rev</th>
                <th className="text-left px-3 py-2 font-semibold">Transmittal</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-right px-3 py-2 font-semibold">Revision Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reg.map((d) => {
                const nextRev =
                  d.currentRev === 'Rev A'
                    ? 'Rev B'
                    : d.currentRev === 'Rev B'
                    ? 'Rev C'
                    : 'Rev D';
                return (
                  <tr key={d.id}>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900 dark:text-white">
                      <div>{d.drawingNo}</div>
                      <div className="text-[10px] font-sans font-normal text-slate-500">
                        {d.discipline}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-white">{d.title}</div>
                      <div className="text-[11px] text-slate-500">{d.reviewComments}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">{d.currentRev}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">
                      {d.transmittalNo} · {d.updatedAt}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={d.status}
                        onChange={(e) =>
                          updateDrawingRegisterItem(d.id, {
                            status: e.target.value as DrawingRegisterItem['status'],
                          })
                        }
                        className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Approved">Approved</option>
                        <option value="IFC">IFC</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          updateDrawingRegisterItem(d.id, {
                            currentRev: nextRev,
                            status: 'Under Review',
                          })
                        }
                        className="text-[11px] font-medium text-orange-600 hover:underline"
                      >
                        Issue {nextRev}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Drawing Requests */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Pending Drawing Requests from Estimators & Site Team
        </h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {reqs.map((r) => (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                  <RoleBadge role={r.requestedRole} compact />
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Requested by {r.requestedBy} · {r.discipline} · Priority: {r.priority} · Due {r.dueDate}
                </div>
              </div>
              {r.status === 'Issued' ? (
                <span className="text-[11px] font-semibold text-emerald-600">Issued & Notified</span>
              ) : (
                <button
                  type="button"
                  onClick={() => fulfillDrawingRequest(r.id)}
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-[11px] font-semibold whitespace-nowrap"
                >
                  Issue & Notify QS
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   5. FINANCE / ACCOUNTS DASHBOARD
============================================================================ */
export const FinanceAccountsDashboard: React.FC = () => {
  const { project, summary, activeRoleDef } = useActiveProject();
  const addRABill = useEstimateStore((s) => s.addRABill);
  const updateRABillStatus = useEstimateStore((s) => s.updateRABillStatus);
  const updateVendorInvoiceStatus = useEstimateStore((s) => s.updateVendorInvoiceStatus);

  const [newBillGross, setNewBillGross] = useState(1850000);
  const bills = project.raBills || [];
  const invoices = project.vendorInvoices || [];

  const totalBilled = bills.reduce((s, b) => s + b.grossAmount, 0);
  const totalPaid = bills.filter((b) => b.status === 'Paid').reduce((s, b) => s + b.netPayable, 0);
  const totalRetention = bills.reduce((s, b) => s + b.retentionHeld, 0);
  const totalTax = bills.reduce((s, b) => s + b.taxDeducted, 0);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Finance & Accounts — RA Bills, Cash Flow & Retention"
        subtitle={`Estimate vs budget tracking, payment certificates, vendor payables & taxes (Approval Limit: ${
          activeRoleDef.approvalLimit === -1
            ? 'Unlimited'
            : formatCurrency(activeRoleDef.approvalLimit, project.currency)
        }).`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Approved Estimate Budget', value: formatCompactCurrency(summary.grandTotal, project.currency), sub: `Direct: ${formatCompactCurrency(summary.directCost, project.currency)}` },
          { label: 'Total Billed (RA Gross)', value: formatCompactCurrency(totalBilled, project.currency), sub: `${((totalBilled / Math.max(1, summary.grandTotal)) * 100).toFixed(1)}% of contract` },
          { label: 'Net Paid / Certified', value: formatCompactCurrency(totalPaid, project.currency), sub: `${bills.filter((b) => b.status === 'Under Review').length} bill(s) awaiting certification` },
          { label: 'Retention & Tax Held', value: formatCompactCurrency(totalRetention + totalTax, project.currency), sub: `Ret: ${formatCompactCurrency(totalRetention, project.currency)} · Tax: ${formatCompactCurrency(totalTax, project.currency)}` },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-500">{k.label}</div>
            <div className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-1">{k.value}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Running Bills (RA Bills) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-600" />
            <span>Running Account Bills (RA Payment Certificates)</span>
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="number"
              step={50000}
              value={newBillGross}
              onChange={(e) => setNewBillGross(Math.max(1000, Number(e.target.value) || 0))}
              className="w-36 px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <button
              type="button"
              onClick={() => {
                const ret = Math.round(newBillGross * 0.05);
                const tax = Math.round(newBillGross * (project.taxPct / 100));
                addRABill({
                  billNo: `RA-0${bills.length + 1}`,
                  periodLabel: `Period 0${bills.length + 1}`,
                  submittedDate: new Date().toISOString().slice(0, 10),
                  grossAmount: newBillGross,
                  retentionPct: 5,
                  retentionHeld: ret,
                  taxDeducted: tax,
                  netPayable: newBillGross - ret - tax,
                  status: 'Submitted',
                });
              }}
              className="px-3 py-1.5 rounded bg-orange-600 text-white font-semibold whitespace-nowrap"
            >
              Generate RA-0{bills.length + 1}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Bill No & Period</th>
                <th className="text-right px-3 py-2 font-semibold">Gross</th>
                <th className="text-right px-3 py-2 font-semibold">Retention (5%)</th>
                <th className="text-right px-3 py-2 font-semibold">Tax</th>
                <th className="text-right px-3 py-2 font-semibold">Net Payable</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-right px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {bills.map((b) => {
                const overLimit =
                  activeRoleDef.approvalLimit > 0 && b.grossAmount > activeRoleDef.approvalLimit;
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{b.billNo}</div>
                      <div className="text-[11px] text-slate-500">{b.periodLabel}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(b.grossAmount, project.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">
                      {formatCurrency(b.retentionHeld, project.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">
                      {formatCurrency(b.taxDeducted, project.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(b.netPayable, project.currency)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{b.status}</td>
                    <td className="px-3 py-2.5 text-right">
                      {b.status !== 'Paid' && (
                        <button
                          type="button"
                          disabled={overLimit}
                          onClick={() =>
                            updateRABillStatus(b.id, b.status === 'Approved' ? 'Paid' : 'Approved')
                          }
                          className="px-2.5 py-1 rounded bg-[#0F2137] text-white text-[11px] font-medium disabled:opacity-40"
                        >
                          {b.status === 'Approved' ? 'Mark Paid' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Invoices & Cash Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Vendor Invoices & Payables
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {invoices.map((inv) => (
              <div key={inv.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {inv.invoiceNo} · {inv.vendorName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {inv.category} · Due {inv.dueDate}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{formatCurrency(inv.amount, project.currency)}</span>
                  <select
                    value={inv.status}
                    onChange={(e) =>
                      updateVendorInvoiceStatus(inv.id, e.target.value as 'Pending' | 'Approved' | 'Paid')
                    }
                    className="px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Projected Monthly Cash Flow
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.cashFlow} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => formatCompactCurrency(v, project.currency)} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0), project.currency)} contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', fontSize: '12px' }} />
                <Bar dataKey="plannedMonthlyCost" name="Monthly Cash Outflow" fill="#7C3AED" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   6. SITE ENGINEER DASHBOARD (DAILY REPORT AUTO-SYNC + QA/QC + SITE PHOTOS)
============================================================================ */
export const SiteEngineerDashboard: React.FC = () => {
  const { project, summary } = useActiveProject();
  const submitDailySiteReport = useEstimateStore((s) => s.submitDailySiteReport);
  const toggleQAChecklist = useEstimateStore((s) => s.toggleQAChecklist);

  const [boqId, setBoqId] = useState(project.boqItems[3]?.id || project.boqItems[0]?.id || '');
  const [qtyToday, setQtyToday] = useState(4.5);
  const [workDesc, setWorkDesc] = useState('');
  const [matNote, setMatNote] = useState('35 bags OPC Cement, 95 CFT Sand');
  const [photoCap, setPhotoCap] = useState('Site pour & rebar inspection check');
  const [siteObservations, setSiteObservations] = useState('');
  const [weather, setWeather] = useState<DailySiteReport['weather']>('Clear');
  const [dictationTarget, setDictationTarget] = useState<DictationTargetField>('observations');
  const [micTriggerCount, setMicTriggerCount] = useState(0);
  const [voiceMeta, setVoiceMeta] = useState<{
    durationSec: number;
    source: 'gemini' | 'browser';
  } | null>(null);

  const selectedItem = summary.items.find((i) => i.id === boqId);
  const reports = project.dailySiteReports || [];
  const qaList = project.qaChecklists || [];

  const handleInsertTranscript = (
    target: DictationTargetField,
    transcript: string,
    mode: 'append' | 'replace',
    meta: { durationSec: number; source: 'gemini' | 'browser' }
  ) => {
    const mergeText = (current: string, separator = ' ') => {
      if (mode === 'replace' || !current.trim()) return transcript;
      return `${current.trim()}${separator}${transcript}`;
    };

    if (target === 'workDesc') {
      setWorkDesc((prev) => mergeText(prev, ' '));
    } else if (target === 'materials') {
      setMatNote((prev) => mergeText(prev, ', '));
    } else if (target === 'photoTag') {
      setPhotoCap((prev) => mergeText(prev, ' · '));
    } else {
      setSiteObservations((prev) => mergeText(prev, '\n'));
    }

    setVoiceMeta((prev) => ({
      durationSec: (prev?.durationSec || 0) + meta.durationSec,
      source: meta.source,
    }));
  };

  const quickDictateField = (field: DictationTargetField) => {
    setDictationTarget(field);
    setMicTriggerCount((c) => c + 1);
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Site Engineer — Daily Progress, Quantities & QA/QC"
        subtitle="Log field quantities, dictate site observations via microphone (auto-syncs to Master Schedule & EVM), and manage QA/QC inspections."
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Daily Progress Entry Form */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <HardHat className="w-4 h-4 text-orange-600" />
            <span>Submit Daily Progress Report (Auto-Syncs Schedule)</span>
          </h2>

          {/* Voice-to-Text Field Dictation Panel */}
          <VoiceDictationControl
            activeTarget={dictationTarget}
            onChangeTarget={setDictationTarget}
            onInsertTranscript={handleInsertTranscript}
            externalTriggerCount={micTriggerCount}
          />

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">BOQ Activity</label>
              <select
                value={boqId}
                onChange={(e) => setBoqId(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                {summary.items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.itemNo} — {it.description} ({it.actualProgressPct}%)
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Qty Executed Today ({selectedItem?.unit || 'unit'})
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.1}
                  value={qtyToday}
                  onChange={(e) => setQtyToday(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Site Weather</label>
                <select
                  value={weather}
                  onChange={(e) => setWeather(e.target.value as DailySiteReport['weather'])}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value="Clear">Clear</option>
                  <option value="Partly Cloudy">Partly Cloudy</option>
                  <option value="Rain Delay">Rain Delay</option>
                  <option value="High Wind">High Wind</option>
                </select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-500">Photo Log Tag</label>
                <button
                  type="button"
                  onClick={() => quickDictateField('photoTag')}
                  className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
                >
                  <Mic className="w-3 h-3" />
                  <span>Dictate</span>
                </button>
              </div>
              <input
                type="text"
                value={photoCap}
                onChange={(e) => setPhotoCap(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-500">Work Executed Description</label>
                <button
                  type="button"
                  onClick={() => quickDictateField('workDesc')}
                  className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
                >
                  <Mic className="w-3 h-3" />
                  <span>Dictate</span>
                </button>
              </div>
              <input
                type="text"
                value={workDesc}
                onChange={(e) => setWorkDesc(e.target.value)}
                placeholder="e.g., Cast First Floor Slab Grid A–C..."
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-500">Material Consumed</label>
                <button
                  type="button"
                  onClick={() => quickDictateField('materials')}
                  className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
                >
                  <Mic className="w-3 h-3" />
                  <span>Dictate</span>
                </button>
              </div>
              <input
                type="text"
                value={matNote}
                onChange={(e) => setMatNote(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-500">
                  Site Observations &amp; Field Notes (Voice or Manual)
                </label>
                <button
                  type="button"
                  onClick={() => quickDictateField('observations')}
                  className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
                >
                  <Mic className="w-3 h-3" />
                  <span>Dictate</span>
                </button>
              </div>
              <textarea
                rows={3}
                value={siteObservations}
                onChange={(e) => setSiteObservations(e.target.value)}
                placeholder="Dictate slump test results, rebar cover checks, crew productivity, RFI blockers, or weather impacts..."
                className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded resize-y"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!boqId) return;
                submitDailySiteReport(
                  {
                    date: new Date().toISOString().slice(0, 10),
                    submittedBy: 'Bilal Tariq',
                    submitterRole: 'Site Engineer',
                    boqItemId: boqId,
                    workDescription:
                      workDesc.trim() || `Executed ${qtyToday} ${selectedItem?.unit || ''} on ${selectedItem?.itemNo}`,
                    qtyExecuted: qtyToday,
                    unit: selectedItem?.unit || 'unit',
                    materialConsumed: matNote,
                    weather,
                    photoCaption: photoCap,
                    siteObservations: siteObservations.trim() || undefined,
                    voiceDurationSec: voiceMeta?.durationSec,
                    voiceTranscriptionSource: voiceMeta?.source,
                  },
                  true
                );
                setWorkDesc('');
                setSiteObservations('');
                setVoiceMeta(null);
              }}
              className="w-full py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              Submit & Auto-Sync to Schedule
            </button>
          </div>
        </div>

        {/* Daily Progress Logs & Site Inspection Photos */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-orange-600" />
            <span>Field Execution Log & Site Inspection Captions</span>
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {reports.map((rep) => (
              <div key={rep.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {rep.workDescription}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {rep.date} · {rep.weather}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Qty: <span className="font-mono font-semibold">{rep.qtyExecuted} {rep.unit}</span> · Material: {rep.materialConsumed}
                </div>
                {rep.siteObservations && (
                  <div className="text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded px-2.5 py-1.5 whitespace-pre-line">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      Site Observations:
                    </span>{' '}
                    {rep.siteObservations}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-0.5">
                  <span className="text-slate-600 dark:text-slate-300">
                    Site Photo: {rep.photoCaption}
                    {rep.voiceDurationSec ? (
                      <span className="text-slate-500 dark:text-slate-400">
                        {' '}
                        · Voice note ({Math.floor(rep.voiceDurationSec / 60)}:
                        {String(rep.voiceDurationSec % 60).padStart(2, '0')})
                      </span>
                    ) : null}
                  </span>
                  <span className={rep.syncedToSchedule ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                    {rep.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QA/QC Inspection Checklists */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-orange-600" />
          <span>QA/QC Engineering Inspection Checklists</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Inspection Point</th>
                <th className="text-left px-3 py-2 font-semibold">Date</th>
                <th className="text-left px-3 py-2 font-semibold">Remarks</th>
                <th className="text-right px-3 py-2 font-semibold">QA Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {qaList.map((qa) => (
                <tr key={qa.id}>
                  <td className="px-3 py-2 font-semibold">{qa.title}</td>
                  <td className="px-3 py-2 font-mono">{qa.date}</td>
                  <td className="px-3 py-2 text-slate-500">{qa.remarks}</td>
                  <td className="px-3 py-2 text-right">
                    <select
                      value={qa.result}
                      onChange={(e) =>
                        toggleQAChecklist(qa.id, e.target.value as QAChecklistItem['result'])
                      }
                      className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    >
                      <option value="Pass">Pass</option>
                      <option value="Hold">Hold</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   7. PROCUREMENT DASHBOARD (PRs, QUOTES COMPARISON, POs & DELIVERIES)
============================================================================ */
export const ProcurementDashboard: React.FC = () => {
  const { project, summary } = useActiveProject();
  const addPurchaseRequisition = useEstimateStore((s) => s.addPurchaseRequisition);
  const selectVendorQuoteAndIssuePO = useEstimateStore((s) => s.selectVendorQuoteAndIssuePO);
  const updateDeliveryStatus = useEstimateStore((s) => s.updateDeliveryStatus);

  const [matName, setMatName] = useState('Porcelain Floor Tiles 600x600mm');
  const [matQty, setMatQty] = useState(190);
  const [matUnit, setMatUnit] = useState('m²');

  const prs = project.purchaseRequisitions || [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Procurement — Requisitions, Vendor Quotes & PO Tracking"
        subtitle="Linked to BOQ Material Schedule for automated takeoffs, multi-vendor bid comparison & inbound delivery tracking."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">BOQ Material Budget</div>
          <div className="text-xl font-mono font-bold mt-1">
            {formatCompactCurrency(summary.materialCost, project.currency)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Purchase Requisitions</div>
          <div className="text-xl font-mono font-bold mt-1">{prs.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Awaiting Vendor Selection</div>
          <div className="text-xl font-mono font-bold text-orange-600 mt-1">
            {prs.filter((p) => p.status === 'Pending Quotes').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">POs In Transit / Ordered</div>
          <div className="text-xl font-mono font-bold mt-1">
            {prs.filter((p) => p.deliveryStatus && p.deliveryStatus !== 'Delivered').length}
          </div>
        </div>
      </div>

      {/* PRs & Vendor Quote Comparison */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-orange-600" />
            <span>Purchase Requisitions, Quote Comparison & PO Delivery</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={matName}
              onChange={(e) => setMatName(e.target.value)}
              className="w-52 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="number"
              min={1}
              value={matQty}
              onChange={(e) => setMatQty(Number(e.target.value) || 1)}
              className="w-20 px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <input
              type="text"
              value={matUnit}
              onChange={(e) => setMatUnit(e.target.value)}
              placeholder="Unit"
              className="w-16 px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <button
              type="button"
              onClick={() =>
                addPurchaseRequisition({
                  prNo: `PR-2026-0${prs.length + 11}`,
                  materialName: matName,
                  qty: matQty,
                  unit: matUnit,
                  requiredDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
                  requestedBy: 'Bilal Tariq',
                  status: 'Pending Quotes',
                  quotes: [
                    { id: `q-${Date.now()}-1`, vendorName: 'Master Tiles Lahore', unitPrice: 3650, leadTimeDays: 3, paymentTerms: 'Net 15' },
                    { id: `q-${Date.now()}-2`, vendorName: 'Shabbir Ceramics Depot', unitPrice: 3780, leadTimeDays: 2, paymentTerms: 'Net 30' },
                  ],
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-orange-600 text-white font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create PR</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {prs.map((pr) => (
            <div
              key={pr.id}
              className="p-4 rounded-md border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white mr-2">
                    {pr.prNo}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {pr.materialName}
                  </span>
                  <span className="text-slate-500 ml-2 font-mono">
                    ({formatNum(pr.qty, 0)} {pr.unit} · Req {pr.requiredDate})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {pr.poNumber ? (
                    <>
                      <span className="font-mono font-semibold text-emerald-600">
                        {pr.poNumber} · {pr.selectedVendor}
                      </span>
                      <select
                        value={pr.deliveryStatus || 'Ordered'}
                        onChange={(e) =>
                          updateDeliveryStatus(
                            pr.id,
                            e.target.value as 'Ordered' | 'In Transit' | 'Partial' | 'Delivered'
                          )
                        }
                        className="px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="Ordered">Ordered</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Partial">Partial</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </>
                  ) : (
                    <span className="font-semibold text-orange-600">{pr.status}</span>
                  )}
                </div>
              </div>

              {pr.quotes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {pr.quotes.map((q) => {
                    const isAwarded = pr.selectedVendor === q.vendorName;
                    return (
                      <div
                        key={q.id}
                        className={`p-2.5 rounded border flex items-center justify-between gap-2 ${
                          isAwarded
                            ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {q.vendorName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {formatCurrency(q.unitPrice, project.currency)}/{pr.unit} · {q.leadTimeDays}d · {q.paymentTerms}
                          </div>
                        </div>
                        {!pr.poNumber && (
                          <button
                            type="button"
                            onClick={() => selectVendorQuoteAndIssuePO(pr.id, q.vendorName)}
                            className="px-2.5 py-1 rounded bg-[#0F2137] text-white text-[11px] font-medium shrink-0"
                          >
                            Award PO
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   8. CLIENT / VIEWER DASHBOARD (READ-ONLY EXECUTIVE PROGRESS & REPORTS)
============================================================================ */
export const ClientViewerDashboard: React.FC = () => {
  const { project, summary, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const milestones = summary.tasks.filter((t, idx) => t.isMilestone || idx % 3 === 0).slice(0, 6);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Client Executive Portal — Read-Only Progress & Milestones"
        subtitle="Approved budget, construction completion percentage, key milestones & downloadable executive reports."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md">
              <Lock className="w-3.5 h-3.5" /> Read-Only Access
            </span>
            <button
              type="button"
              onClick={() =>
                exportReportToPDF('full-estimate', project, summary, companyProfile, unitSystem)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Report PDF</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Approved Contract / Estimate</div>
          <div className="text-xl font-mono font-bold mt-1">
            {formatCurrency(summary.grandTotal, project.currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Built-up: {formatNum(convertArea(project.builtUpArea, unitSystem), 0)} {getAreaLabel(unitSystem)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Overall Physical Progress</div>
          <div className="text-xl font-mono font-bold text-emerald-600 mt-1">
            {summary.evm.overallProgressPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Status Day {summary.evm.statusDay}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Project Completion Target</div>
          <div className="text-xl font-mono font-bold mt-1">
            {summary.totalDurationCalendarDays} Calendar Days
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Start: {project.startDate}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-[11px] text-slate-500">Approval Status</div>
          <div className="text-xl font-display font-bold mt-1">{project.approvalStatus}</div>
          <div className="text-[11px] text-slate-500 mt-1">{project.revisions.length} published revision(s)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Construction Milestones Progress
          </h2>
          <div className="space-y-3 text-xs">
            {milestones.map((m) => (
              <div key={m.boqItemId} className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-sm">
                    {m.itemNo} {m.name}
                  </span>
                  <span className="font-mono font-semibold">{m.actualProgressPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 rounded-full"
                    style={{ width: `${m.actualProgressPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Approved Client Reports
          </h2>
          <div className="space-y-2 text-xs">
            {[
              { id: 'full-estimate' as const, label: 'Executive Project Estimate Summary (PDF)' },
              { id: 'abstract-cost' as const, label: 'Approved Abstract of Cost / BOQ (Excel)' },
              { id: 'gantt-schedule' as const, label: 'Master Schedule & Cash Flow Plan (PDF)' },
            ].map((rep) => (
              <div
                key={rep.label}
                className="p-3 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between"
              >
                <span className="font-medium flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-orange-600" />
                  {rep.label}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    rep.label.includes('Excel')
                      ? exportReportToExcel('abstract-cost', project, summary, [], unitSystem)
                      : exportReportToPDF(rep.id, project, summary, companyProfile, unitSystem)
                  }
                  className="px-3 py-1 rounded bg-[#0F2137] text-white text-[11px] font-medium"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
