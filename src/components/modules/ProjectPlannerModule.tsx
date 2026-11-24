import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Diamond,
  GitBranch,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { computeCPMSchedule } from '../../engine/calculations';
import { formatCompactCurrency, formatCurrency, formatNum } from '../../engine/formatters';
import {
  ActivityDependency,
  CPMTask,
  DelayRiskItem,
  DependencyType,
  ScheduleConstraintType,
} from '../../types/estimate';
import { RoleBadge } from '../common/RoleBadge';

type PlannerTab = 'wbs-gantt' | 'resources' | 'evm' | 'lookahead' | 'scenarios-risks';

const TEAM_LEADERS = ['Bilal Tariq', 'Ustad Rasheed', 'M. Akram', 'Haji Irfan', 'Eleanor Vance, PE'];

export const ProjectPlannerModule: React.FC = () => {
  const { project, summary, resources } = useActiveProject();
  const updateBOQItem = useEstimateStore((s) => s.updateBOQItem);
  const updateActiveProject = useEstimateStore((s) => s.updateActiveProject);
  const addWBSNode = useEstimateStore((s) => s.addWBSNode);
  const addScheduleScenario = useEstimateStore((s) => s.addScheduleScenario);
  const deleteScheduleScenario = useEstimateStore((s) => s.deleteScheduleScenario);
  const addDelayRisk = useEstimateStore((s) => s.addDelayRisk);
  const updateDelayRisk = useEstimateStore((s) => s.updateDelayRisk);
  const deleteDelayRisk = useEstimateStore((s) => s.deleteDelayRisk);
  const levelScheduleResources = useEstimateStore((s) => s.levelScheduleResources);
  const verifyAndSyncDailyReport = useEstimateStore((s) => s.verifyAndSyncDailyReport);

  const [tab, setTab] = useState<PlannerTab>('wbs-gantt');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(summary.tasks[0]?.boqItemId || '');
  const [showBaseline, setShowBaseline] = useState(true);
  const [collapsedWbs, setCollapsedWbs] = useState<Record<string, boolean>>({});
  const [lookAheadWeeks, setLookAheadWeeks] = useState<2 | 4 | 6>(4);
  const [crewCapacity, setCrewCapacity] = useState(16);

  // Drag state on Gantt
  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: 'move' | 'resize';
    startX: number;
    origOffset: number;
    origDur: number;
  } | null>(null);

  // Dependency editor
  const [newPredId, setNewPredId] = useState('');
  const [newDepType, setNewDepType] = useState<DependencyType>('FS');
  const [newDepLag, setNewDepLag] = useState(0);

  // WBS add form
  const [newWbsCode, setNewWbsCode] = useState('1.5');
  const [newWbsName, setNewWbsName] = useState('');

  // Scenario add form
  const [scnName, setScnName] = useState('');
  const [scnCrewMult, setScnCrewMult] = useState(1.25);
  const [scnProdMult, setScnProdMult] = useState(1.0);
  const [scnShift, setScnShift] = useState(0);
  const [scnBuffer, setScnBuffer] = useState(0);

  // Risk add form
  const [riskTitle, setRiskTitle] = useState('');
  const [riskCat, setRiskCat] = useState<DelayRiskItem['category']>('Schedule');
  const [riskDays, setRiskDays] = useState(3);
  const [riskCost, setRiskCost] = useState(50000);
  const [riskOwner, setRiskOwner] = useState('Bilal Tariq');
  const [riskMitigation, setRiskMitigation] = useState('');

  const pxPerDay = 17;
  const totalTimelineDays = Math.max(30, summary.totalDurationWorkingDays + 6);

  const selectedTask: CPMTask | undefined = useMemo(
    () => summary.tasks.find((t) => t.boqItemId === selectedTaskId) || summary.tasks[0],
    [summary.tasks, selectedTaskId]
  );
  const selectedBoqItem = project.boqItems.find((b) => b.id === selectedTask?.boqItemId);

  const taskById = useMemo(() => {
    const m = new Map<string, CPMTask>();
    summary.tasks.forEach((t) => m.set(t.boqItemId, t));
    return m;
  }, [summary.tasks]);

  // Custom capacity resource histogram
  const resourceHistogram = useMemo(
    () =>
      computeCPMSchedule(
        summary.items,
        project.calendar.workingDaysPerWeek,
        project.calendar.weatherBufferDays,
        crewCapacity
      ),
    [summary.items, project.calendar.workingDaysPerWeek, project.calendar.weatherBufferDays, crewCapacity]
  );

  // What-if scenarios evaluation
  const scenarioComparisons = useMemo(() => {
    const scenarios = project.scheduleScenarios || [];
    return scenarios.map((sc) => {
      const simulatedItems = summary.items.map((item) => ({
        ...item,
        crewSize: Math.max(1, Math.round(item.crewSize * sc.crewMultiplier)),
        productivityPerDay: item.productivityPerDay * sc.productivityMultiplier,
        startOffsetDays: (item.startOffsetDays || 0) + sc.startShiftDays,
        manualDurationDays:
          item.manualDurationDays !== undefined
            ? Math.max(1, Math.round(item.manualDurationDays / Math.max(0.2, sc.crewMultiplier * sc.productivityMultiplier)))
            : undefined,
      }));
      const sim = computeCPMSchedule(
        simulatedItems,
        project.calendar.workingDaysPerWeek,
        project.calendar.weatherBufferDays + sc.extraBufferDays,
        crewCapacity
      );
      const peakWorkers = Math.max(0, ...sim.manpowerHistogram.map((h) => h.workers));
      return {
        ...sc,
        workingDays: sim.totalWorkingDays,
        calendarDays: sim.totalCalendarDays,
        peakWorkers,
        overAllocated: sim.overAllocatedBuckets,
        deltaDays: sim.totalWorkingDays - summary.totalDurationWorkingDays,
      };
    });
  }, [
    project.scheduleScenarios,
    summary.items,
    project.calendar.workingDaysPerWeek,
    project.calendar.weatherBufferDays,
    crewCapacity,
    summary.totalDurationWorkingDays,
  ]);

  // Look-ahead filtered activities
  const lookAheadActivities = useMemo(() => {
    const curDay = summary.evm.statusDay;
    const horizonEnd = curDay + lookAheadWeeks * 6;
    return summary.tasks
      .filter((t) => t.earlyFinish >= curDay && t.earlyStart <= horizonEnd)
      .sort((a, b) => a.earlyStart - b.earlyStart);
  }, [summary.tasks, summary.evm.statusDay, lookAheadWeeks]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const deltaDays = Math.round((e.clientX - dragState.startX) / pxPerDay);
    if (dragState.mode === 'move') {
      updateBOQItem(dragState.taskId, { startOffsetDays: Math.max(0, dragState.origOffset + deltaDays) });
    } else {
      updateBOQItem(dragState.taskId, { manualDurationDays: Math.max(1, dragState.origDur + deltaDays) });
    }
  };

  const handleMouseUp = () => {
    if (dragState) setDragState(null);
  };

  const addDependency = () => {
    if (!selectedBoqItem || !newPredId || newPredId === selectedBoqItem.id) return;
    if (selectedBoqItem.dependencies.some((d) => d.predecessorId === newPredId)) return;
    const nextDeps: ActivityDependency[] = [
      ...selectedBoqItem.dependencies,
      { predecessorId: newPredId, type: newDepType, lagDays: newDepLag },
    ];
    updateBOQItem(selectedBoqItem.id, { dependencies: nextDeps });
    setNewPredId('');
  };

  const removeDependency = (predId: string) => {
    if (!selectedBoqItem) return;
    updateBOQItem(selectedBoqItem.id, {
      dependencies: selectedBoqItem.dependencies.filter((d) => d.predecessorId !== predId),
    });
  };

  const wbsNodes = project.wbsNodes || [];
  const risks = project.risksAndDelays || [];
  const dailyReports = project.dailySiteReports || [];

  return (
    <div className="space-y-5" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Header & Top Metrics */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{project.code}</span>
            <span aria-hidden="true">·</span>
            <span>Status Day {summary.evm.statusDay}</span>
            <span aria-hidden="true">·</span>
            <span>{summary.totalDurationWorkingDays} Working Days</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              SPI {summary.evm.spi.toFixed(2)} · CPI {summary.evm.cpi.toFixed(2)}
            </span>
          </div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white mt-0.5">
            Project Planner — WBS, CPM, Resources & EVM
          </h1>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          {(
            [
              { id: 'wbs-gantt', label: 'WBS & CPM Gantt' },
              { id: 'resources', label: 'Resources & Leveling' },
              { id: 'evm', label: 'EVM & Cost S-Curve' },
              { id: 'lookahead', label: 'Look-Ahead & Site Sync' },
              { id: 'scenarios-risks', label: 'Scenarios & Risks' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          {
            label: 'Master Duration',
            value: `${summary.totalDurationWorkingDays}d / ${summary.totalDurationCalendarDays}c`,
            sub: `${summary.tasks.filter((t) => t.isCritical).length} critical activities`,
          },
          {
            label: 'Overall Progress',
            value: `${summary.evm.overallProgressPct.toFixed(1)}%`,
            sub: `Status Day ${summary.evm.statusDay}`,
          },
          {
            label: 'Schedule Perf (SPI)',
            value: summary.evm.spi.toFixed(2),
            sub: summary.evm.spi >= 0.98 ? 'On / Ahead of Schedule' : `Forecast ${summary.evm.forecastWorkingDays}d`,
            alert: summary.evm.spi < 0.95,
          },
          {
            label: 'Cost Perf (CPI)',
            value: summary.evm.cpi.toFixed(2),
            sub: `EAC ${formatCompactCurrency(summary.evm.eac, project.currency)}`,
            alert: summary.evm.cpi < 0.95,
          },
          {
            label: 'Resource Alerts',
            value: `${resourceHistogram.overAllocatedBuckets} periods`,
            sub: `Cap ${crewCapacity} workers/day`,
            alert: resourceHistogram.overAllocatedBuckets > 0,
          },
          {
            label: 'Open Delay Risks',
            value: `${risks.filter((r) => r.status === 'Open').length} active`,
            sub: `${risks.filter((r) => r.status === 'Open').reduce((s, r) => s + r.impactDays, 0)}d exposure`,
            alert: risks.some((r) => r.status === 'Open' && r.probability === 'High'),
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5"
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {kpi.label}
            </div>
            <div
              className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                kpi.alert ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              {kpi.value}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* TAB 1: WBS TREE + INTERACTIVE CPM GANTT (FS, SS, FF, SF + CONSTRAINTS) */}
      {tab === 'wbs-gantt' && (
        <div className="space-y-5">
          {/* WBS Hierarchical Tree */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-600" />
                  <span>Work Breakdown Structure (WBS) Linked to BOQ</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Project &gt; Phase &gt; Work Package &gt; Scheduled BOQ Activities
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newWbsCode}
                  onChange={(e) => setNewWbsCode(e.target.value)}
                  placeholder="Code"
                  className="w-16 px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <input
                  type="text"
                  value={newWbsName}
                  onChange={(e) => setNewWbsName(e.target.value)}
                  placeholder="New WBS phase or work package..."
                  className="w-52 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newWbsName.trim()) return;
                    addWBSNode({
                      code: newWbsCode || '1.x',
                      name: newWbsName.trim(),
                      level: 'Phase',
                      parentId: wbsNodes[0]?.id,
                      boqItemIds: [],
                      ownerRole: 'Site Engineer',
                    });
                    setNewWbsName('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#0F2137] text-white text-xs font-medium whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Node</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">WBS Code & Hierarchy</th>
                    <th className="text-left px-3 py-2 font-semibold">Level / Owner</th>
                    <th className="text-right px-3 py-2 font-semibold">Cost Rollup</th>
                    <th className="text-right px-3 py-2 font-semibold">Window</th>
                    <th className="text-right px-3 py-2 font-semibold">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {wbsNodes.map((node) => {
                    const isCollapsed = collapsedWbs[node.id];
                    const indent = node.level === 'Project' ? 0 : node.level === 'Phase' ? 16 : 32;
                    const childPackages = wbsNodes.filter((n) => n.parentId === node.id);
                    const linkedIds =
                      node.level === 'Project'
                        ? summary.tasks.map((t) => t.boqItemId)
                        : node.level === 'Phase'
                        ? childPackages.flatMap((c) => c.boqItemIds)
                        : node.boqItemIds;
                    const linkedTasks = linkedIds
                      .map((id) => taskById.get(id))
                      .filter((t): t is CPMTask => Boolean(t));
                    const totalCost = linkedTasks.reduce((s, t) => s + t.cost, 0);
                    const minStart = linkedTasks.length
                      ? Math.min(...linkedTasks.map((t) => t.earlyStart)) + 1
                      : 1;
                    const maxEnd = linkedTasks.length
                      ? Math.max(...linkedTasks.map((t) => t.earlyFinish))
                      : 1;
                    const avgProg =
                      totalCost > 0
                        ? linkedTasks.reduce((s, t) => s + t.cost * (t.actualProgressPct / 100), 0) /
                          totalCost *
                          100
                        : 0;

                    return (
                      <React.Fragment key={node.id}>
                        <tr className="bg-slate-50/70 dark:bg-slate-800/30 hover:bg-slate-100/80 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                            <div
                              style={{ paddingLeft: `${indent}px` }}
                              className="flex items-center gap-1.5"
                            >
                              {(node.boqItemIds.length > 0 || childPackages.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedWbs((c) => ({ ...c, [node.id]: !c[node.id] }))
                                  }
                                  className="text-slate-400 hover:text-slate-700"
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <span className="font-mono text-slate-500">{node.code}</span>
                              <span className="font-semibold">{node.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span>{node.level}</span>
                              {node.ownerRole && <RoleBadge role={node.ownerRole} compact />}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                            {formatCurrency(totalCost, project.currency)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                            D{minStart}–D{maxEnd}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {avgProg.toFixed(0)}%
                          </td>
                        </tr>

                        {!isCollapsed &&
                          node.level === 'Work Package' &&
                          linkedTasks.map((t) => (
                            <tr
                              key={t.boqItemId}
                              onClick={() => setSelectedTaskId(t.boqItemId)}
                              className="cursor-pointer hover:bg-orange-50/40 dark:hover:bg-orange-950/20"
                            >
                              <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                                <div style={{ paddingLeft: '48px' }} className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-400">
                                    BOQ {t.itemNo}
                                  </span>
                                  <span className="truncate max-w-md">{t.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-[11px] text-slate-500">
                                {t.assignedTeamLeader || 'Bilal Tariq'} · {t.isCritical ? 'Critical' : `Float ${t.totalFloat}d`}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {formatCurrency(t.cost, project.currency)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-500">
                                D{t.earlyStart + 1}–D{t.earlyFinish} ({t.durationDays}d)
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {t.actualProgressPct}%
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Calendar Bar + Interactive Gantt + Inspector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-600" />
                <span className="font-semibold">Calendar:</span>
                <select
                  value={project.calendar.workingDaysPerWeek}
                  onChange={(e) =>
                    updateActiveProject({
                      calendar: {
                        ...project.calendar,
                        workingDaysPerWeek: Number(e.target.value) as 5 | 6 | 7,
                      },
                    })
                  }
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                >
                  <option value={5}>5d/wk</option>
                  <option value={6}>6d/wk</option>
                  <option value={7}>7d/wk</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Weather Buffer:</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={project.calendar.weatherBufferDays}
                  onChange={(e) =>
                    updateActiveProject({
                      calendar: {
                        ...project.calendar,
                        weatherBufferDays: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <span className="text-slate-500">days</span>
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBaseline}
                  onChange={(e) => setShowBaseline(e.target.checked)}
                  className="accent-orange-600"
                />
                <span>Baseline Overlay</span>
              </label>
            </div>
            <div className="text-[11px] text-slate-500">
              Drag bar to reschedule · Drag right edge to resize · Supports FS, SS, FF, SF + SNET/FNLT constraints
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Interactive Gantt */}
            <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${340 + totalTimelineDays * pxPerDay}px` }}>
                  <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <div className="w-[320px] shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 flex justify-between">
                      <span>BOQ Activity</span>
                      <span>Dur · Float</span>
                    </div>
                    <div className="flex-1 flex relative">
                      {Array.from({ length: Math.ceil(totalTimelineDays / 5) }).map((_, wk) => (
                        <div
                          key={wk}
                          style={{ width: `${5 * pxPerDay}px` }}
                          className="shrink-0 px-1.5 py-2.5 border-r border-slate-200/70 dark:border-slate-700/70 font-mono text-[10px]"
                        >
                          D{wk * 5 + 1}–{wk * 5 + 5}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 select-none relative">
                    {summary.tasks.map((task) => {
                      const isSelected = task.boqItemId === selectedTask?.boqItemId;
                      const barLeft = task.earlyStart * pxPerDay;
                      const barWidth = Math.max(task.isMilestone ? 14 : pxPerDay, task.durationDays * pxPerDay);
                      const baseLeft = task.baselineStartDay * pxPerDay;
                      const baseWidth = Math.max(8, task.baselineDurationDays * pxPerDay);

                      return (
                        <div
                          key={task.boqItemId}
                          onClick={() => setSelectedTaskId(task.boqItemId)}
                          className={`flex items-center h-10 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-orange-50/60 dark:bg-orange-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="w-[320px] shrink-0 px-3 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                            <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                              <span className="font-mono text-slate-400 mr-1.5">{task.itemNo}</span>
                              {task.name}
                            </div>
                            <div className="font-mono text-[11px] shrink-0 text-slate-500">
                              {task.isMilestone ? 'MS' : `${task.durationDays}d`} · F{task.totalFloat}
                            </div>
                          </div>

                          <div className="flex-1 relative h-full flex items-center">
                            {showBaseline && !task.isMilestone && (
                              <div
                                style={{ left: `${baseLeft}px`, width: `${baseWidth}px` }}
                                className="absolute bottom-1 h-1 bg-slate-400/60 rounded-full pointer-events-none"
                              />
                            )}
                            {task.isMilestone ? (
                              <div
                                style={{ left: `${barLeft}px` }}
                                className="absolute flex items-center gap-1 text-orange-600"
                              >
                                <Diamond className="w-4 h-4 fill-orange-600" />
                              </div>
                            ) : (
                              <div
                                style={{ left: `${barLeft}px`, width: `${barWidth}px` }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaskId(task.boqItemId);
                                  setDragState({
                                    taskId: task.boqItemId,
                                    mode: 'move',
                                    startX: e.clientX,
                                    origOffset:
                                      project.boqItems.find((b) => b.id === task.boqItemId)?.startOffsetDays || 0,
                                    origDur: task.durationDays,
                                  });
                                }}
                                className={`absolute h-5 rounded-sm flex items-center overflow-hidden cursor-grab active:cursor-grabbing ${
                                  task.isCritical ? 'bg-orange-600 text-white' : 'bg-[#1E3A5F] text-white'
                                }`}
                              >
                                {task.actualProgressPct > 0 && (
                                  <div
                                    style={{ width: `${task.actualProgressPct}%` }}
                                    className="h-full bg-emerald-500/45 pointer-events-none"
                                  />
                                )}
                                <span className="px-1.5 text-[10px] font-mono whitespace-nowrap pointer-events-none">
                                  {task.actualProgressPct > 0 ? `${task.actualProgressPct}%` : `${task.durationDays}d`}
                                </span>
                                <div
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDragState({
                                      taskId: task.boqItemId,
                                      mode: 'resize',
                                      startX: e.clientX,
                                      origOffset: 0,
                                      origDur: task.durationDays,
                                    });
                                  }}
                                  className="ml-auto w-2 h-full cursor-ew-resize hover:bg-white/30"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Inspector (FS/SS/FF/SF + Constraints + Crew) */}
            <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              {selectedTask && selectedBoqItem ? (
                <>
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {selectedTask.itemNo} · {selectedTask.category} ·{' '}
                        <span className={selectedTask.isCritical ? 'text-orange-600 font-semibold' : ''}>
                          {selectedTask.isCritical ? 'Critical Path' : `Float: ${selectedTask.totalFloat}d`}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedTask.name}
                      </h3>
                    </div>
                    <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Duration (d)</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={selectedTask.durationDays}
                          onChange={(e) =>
                            updateBOQItem(selectedBoqItem.id, {
                              manualDurationDays: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        />
                        {selectedBoqItem.manualDurationDays !== undefined && (
                          <button
                            type="button"
                            onClick={() => updateBOQItem(selectedBoqItem.id, { manualDurationDays: undefined })}
                            className="p-1.5 text-slate-400 hover:text-orange-600"
                            title="Revert to auto quantity / (productivity * crew)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Actual Progress %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={selectedBoqItem.actualProgressPct}
                        onChange={(e) =>
                          updateBOQItem(selectedBoqItem.id, {
                            actualProgressPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                        className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Constraint</label>
                      <select
                        value={selectedBoqItem.constraintType || 'ASAP'}
                        onChange={(e) =>
                          updateBOQItem(selectedBoqItem.id, {
                            constraintType: e.target.value as ScheduleConstraintType,
                          })
                        }
                        className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      >
                        <option value="ASAP">ASAP (Default)</option>
                        <option value="SNET">Start No Earlier Than</option>
                        <option value="FNLT">Finish No Later Than</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Constraint Day</label>
                      <input
                        type="number"
                        min={0}
                        disabled={!selectedBoqItem.constraintType || selectedBoqItem.constraintType === 'ASAP'}
                        value={selectedBoqItem.constraintDay ?? 0}
                        onChange={(e) =>
                          updateBOQItem(selectedBoqItem.id, {
                            constraintDay: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-45"
                      />
                    </div>
                  </div>

                  {/* Dependencies FS/SS/FF/SF */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <GitBranch className="w-3.5 h-3.5 text-orange-600" />
                      <span>Dependencies (FS / SS / FF / SF + Lag)</span>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {selectedBoqItem.dependencies.length === 0 ? (
                        <div className="text-[11px] text-slate-400">No predecessors (starts Day 1).</div>
                      ) : (
                        selectedBoqItem.dependencies.map((d) => {
                          const pred = project.boqItems.find((b) => b.id === d.predecessorId);
                          return (
                            <div
                              key={d.predecessorId}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800 text-[11px]"
                            >
                              <span className="truncate">
                                <strong>{pred?.itemNo}</strong> {pred?.description} ({d.type}
                                {d.lagDays >= 0 ? `+${d.lagDays}d` : `${d.lagDays}d`})
                              </span>
                              <button
                                type="button"
                                onClick={() => removeDependency(d.predecessorId)}
                                className="text-red-500 hover:underline shrink-0"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-1.5">
                      <select
                        value={newPredId}
                        onChange={(e) => setNewPredId(e.target.value)}
                        className="col-span-6 px-2 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="">Predecessor...</option>
                        {project.boqItems
                          .filter((b) => b.id !== selectedBoqItem.id)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.itemNo} {b.category}
                            </option>
                          ))}
                      </select>
                      <select
                        value={newDepType}
                        onChange={(e) => setNewDepType(e.target.value as DependencyType)}
                        className="col-span-2 px-1 py-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="FS">FS</option>
                        <option value="SS">SS</option>
                        <option value="FF">FF</option>
                        <option value="SF">SF</option>
                      </select>
                      <input
                        type="number"
                        value={newDepLag}
                        onChange={(e) => setNewDepLag(Number(e.target.value) || 0)}
                        className="col-span-2 px-1.5 py-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <button
                        type="button"
                        onClick={addDependency}
                        className="col-span-2 px-2 py-1.5 text-[11px] rounded bg-orange-600 text-white font-semibold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500">Select an activity to inspect schedule parameters.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RESOURCE PLANNING, OVER-ALLOCATION & LEVELING */}
      {tab === 'resources' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-orange-600" />
                  <span>Resource Histogram & Automated Leveling</span>
                </h2>
                <p className="text-xs text-slate-500">
                  {resourceHistogram.overAllocatedBuckets > 0
                    ? `${resourceHistogram.overAllocatedBuckets} period(s) exceed ${crewCapacity} workers/day limit — level non-critical float.`
                    : `All periods stay within ${crewCapacity} workers/day capacity.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Max Daily Crew Cap:</span>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={crewCapacity}
                    onChange={(e) => setCrewCapacity(Math.max(4, Number(e.target.value) || 16))}
                    className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => levelScheduleResources(crewCapacity)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Auto-Level Non-Critical Tasks</span>
                </button>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resourceHistogram.manpowerHistogram} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
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
                  <ReferenceLine
                    y={crewCapacity}
                    stroke="#DC2626"
                    strokeDasharray="4 4"
                    label={{ value: `Cap (${crewCapacity})`, position: 'insideTopRight', fill: '#DC2626', fontSize: 10 }}
                  />
                  <Bar dataKey="workers" name="Assigned Workers" radius={[3, 3, 0, 0]}>
                    {resourceHistogram.manpowerHistogram.map((entry, idx) => (
                      <Cell key={idx} fill={entry.overAllocated ? '#DC2626' : '#0F2137'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Activity Resource Assignment Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Activity Crew, Equipment & Productivity Assignments
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold">BOQ Activity</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Assigned Team Leader</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Crews</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Output/Day</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Man-Days</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Primary Equipment / Material</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.items.map((item) => {
                    const t = taskById.get(item.id);
                    const matNames = (item.rateAnalysis?.materials || [])
                      .map((m) => resources.find((r) => r.id === m.resourceId)?.name)
                      .filter(Boolean)
                      .slice(0, 2);
                    const eqNames = (item.rateAnalysis?.equipment || [])
                      .map((e) => resources.find((r) => r.id === e.resourceId)?.name)
                      .filter(Boolean);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2">
                          <span className="font-mono text-slate-400 mr-1.5">{item.itemNo}</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {item.description}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.assignedTeamLeader || 'Bilal Tariq'}
                            onChange={(e) =>
                              updateBOQItem(item.id, { assignedTeamLeader: e.target.value })
                            }
                            className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                          >
                            {TEAM_LEADERS.map((tl) => (
                              <option key={tl} value={tl}>
                                {tl}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={item.crewSize}
                            onChange={(e) =>
                              updateBOQItem(item.id, {
                                crewSize: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-14 px-2 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {item.productivityPerDay} {item.unit}/d
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                          {formatNum(t?.laborManDays || 0, 1)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                          {[...eqNames, ...matNames].join(' · ') || 'Manual / Standard Trade'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EARNED VALUE MANAGEMENT (EVM) & COST-LOADED S-CURVE */}
      {tab === 'evm' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                  <span>Earned Value Management (PV, EV, AC, SPI, CPI & Forecast)</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Adjust project data date (Status Day) to evaluate cost & schedule variance against BAC.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  Status Day: <span className="font-mono text-orange-600">D{summary.evm.statusDay}</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(10, summary.totalDurationWorkingDays)}
                  value={summary.evm.statusDay}
                  onChange={(e) =>
                    updateActiveProject({ statusDay: Number(e.target.value) })
                  }
                  className="w-36 accent-orange-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
              {[
                { label: 'Budget at Completion (BAC)', val: formatCompactCurrency(summary.evm.bac, project.currency) },
                { label: 'Planned Value (PV)', val: formatCompactCurrency(summary.evm.pv, project.currency) },
                { label: 'Earned Value (EV)', val: formatCompactCurrency(summary.evm.ev, project.currency) },
                { label: 'Actual Cost (AC)', val: formatCompactCurrency(summary.evm.ac, project.currency) },
                { label: 'Estimate at Completion (EAC)', val: formatCompactCurrency(summary.evm.eac, project.currency) },
                { label: 'Variance at Completion (VAC)', val: formatCompactCurrency(summary.evm.vac, project.currency) },
              ].map((m) => (
                <div
                  key={m.label}
                  className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                >
                  <div className="text-[11px] text-slate-500">{m.label}</div>
                  <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {m.val}
                  </div>
                </div>
              ))}
            </div>

            <div className="h-72">
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
                  <Area
                    type="monotone"
                    dataKey="plannedCumulativeCost"
                    name="Planned Value (PV)"
                    stroke="#0F2137"
                    fill="#1E3A5F"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="earnedCumulativeCost"
                    name="Earned Value (EV)"
                    stroke="#16A34A"
                    fill="#16A34A"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="actualCumulativeCost"
                    name="Actual Cost (AC)"
                    stroke="#EA580C"
                    fill="#EA580C"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LOOK-AHEAD PLANNER (2/4/6 WEEKS) + SITE REPORT AUTO-SYNC */}
      {tab === 'lookahead' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Rolling Look-Ahead & Weekly Work Plan
                </h2>
                <p className="text-xs text-slate-500">
                  Activities active or starting within the next {lookAheadWeeks} weeks from Status Day {summary.evm.statusDay}
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
                {([2, 4, 6] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setLookAheadWeeks(w)}
                    className={`px-2.5 py-1 text-xs font-medium rounded ${
                      lookAheadWeeks === w
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {w} Weeks
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Activity</th>
                    <th className="text-left px-3 py-2 font-semibold">Team Leader</th>
                    <th className="text-right px-3 py-2 font-semibold">Window</th>
                    <th className="text-right px-3 py-2 font-semibold">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lookAheadActivities.map((t) => (
                    <tr key={t.boqItemId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono text-slate-400 mr-1.5">{t.itemNo}</span>
                          {t.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.category} · {t.isCritical ? 'Critical Path' : `Float ${t.totalFloat}d`}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={t.assignedTeamLeader || 'Bilal Tariq'}
                          onChange={(e) =>
                            updateBOQItem(t.boqItemId, { assignedTeamLeader: e.target.value })
                          }
                          className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        >
                          {TEAM_LEADERS.map((tl) => (
                            <option key={tl} value={tl}>
                              {tl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        D{t.earlyStart + 1}–D{t.earlyFinish}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        {t.actualProgressPct}%
                      </td>
                    </tr>
                  ))}
                  {lookAheadActivities.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        No activities scheduled in this look-ahead window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Site Engineer / Team Leader Progress Auto-Feed */}
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Site Progress Feed into Master Schedule
            </h2>
            <p className="text-xs text-slate-500">
              Daily progress logged by Site Engineer / Team Leader updates BOQ completion % and EVM automatically.
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {dailyReports.map((rep) => (
                <div key={rep.id} className="py-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <RoleBadge role={rep.submitterRole} compact />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {rep.submittedBy}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">{rep.date}</span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">{rep.workDescription}</div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="font-mono text-[11px] text-slate-500">
                      Executed: {rep.qtyExecuted} {rep.unit}
                    </span>
                    {rep.syncedToSchedule ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Synced to Schedule
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => verifyAndSyncDailyReport(rep.id)}
                        className="px-2.5 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-semibold"
                      >
                        Verify & Sync to Schedule
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: WHAT-IF SCENARIOS & DELAY/RISK REGISTER */}
      {tab === 'scenarios-risks' && (
        <div className="space-y-5">
          {/* What-If Scenarios */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Copy className="w-4 h-4 text-orange-600" />
                  <span>What-If Schedule Scenario Comparison</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Duplicate the baseline schedule and simulate crew additions, productivity shifts, or weather delays.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={scnName}
                  onChange={(e) => setScnName(e.target.value)}
                  placeholder="Scenario name (e.g. Night Shift Masonry)"
                  className="w-52 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  Crew×
                  <input
                    type="number"
                    step="0.1"
                    min={0.5}
                    max={3}
                    value={scnCrewMult}
                    onChange={(e) => setScnCrewMult(Number(e.target.value) || 1)}
                    className="w-14 px-1.5 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  Buffer+d
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={scnBuffer}
                    onChange={(e) => setScnBuffer(Number(e.target.value) || 0)}
                    className="w-12 px-1.5 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!scnName.trim()) return;
                    addScheduleScenario({
                      name: scnName.trim(),
                      notes: `Crew ×${scnCrewMult}, Productivity ×${scnProdMult}, Shift +${scnShift}d, Extra Buffer +${scnBuffer}d`,
                      crewMultiplier: scnCrewMult,
                      productivityMultiplier: scnProdMult,
                      startShiftDays: scnShift,
                      extraBufferDays: scnBuffer,
                    });
                    setScnName('');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-orange-600 text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Simulate</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Scenario</th>
                    <th className="text-right px-3 py-2 font-semibold">Working Days</th>
                    <th className="text-right px-3 py-2 font-semibold">Calendar Days</th>
                    <th className="text-right px-3 py-2 font-semibold">Variance</th>
                    <th className="text-right px-3 py-2 font-semibold">Peak Crew</th>
                    <th className="text-right px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {scenarioComparisons.map((sc) => (
                    <tr key={sc.id}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{sc.name}</div>
                        <div className="text-[11px] text-slate-500">{sc.notes}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                        {sc.workingDays}d
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {sc.calendarDays}d
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${
                          sc.deltaDays < 0
                            ? 'text-emerald-600'
                            : sc.deltaDays > 0
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {sc.deltaDays > 0 ? `+${sc.deltaDays}d` : `${sc.deltaDays}d`}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {sc.peakWorkers} workers
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {sc.isBaseline ? (
                          <span className="text-[11px] text-slate-400">Baseline</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => deleteScheduleScenario(sc.id)}
                            className="text-[11px] text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delay & Risk Register */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-600" />
                  <span>Schedule Delay & Risk Register</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Track delay causes, impact days, cost exposure, owners, and mitigation plans.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={riskTitle}
                  onChange={(e) => setRiskTitle(e.target.value)}
                  placeholder="New delay / risk title..."
                  className="w-48 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <select
                  value={riskCat}
                  onChange={(e) => setRiskCat(e.target.value as DelayRiskItem['category'])}
                  className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value="Schedule">Schedule</option>
                  <option value="Supply Chain">Supply Chain</option>
                  <option value="Weather">Weather</option>
                  <option value="Technical">Technical</option>
                  <option value="Cost">Cost</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={riskDays}
                  onChange={(e) => setRiskDays(Number(e.target.value) || 1)}
                  className="w-14 px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  title="Impact Days"
                />
                <input
                  type="text"
                  value={riskMitigation}
                  onChange={(e) => setRiskMitigation(e.target.value)}
                  placeholder="Mitigation action..."
                  className="w-44 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!riskTitle.trim()) return;
                    addDelayRisk({
                      title: riskTitle.trim(),
                      category: riskCat,
                      impactDays: riskDays,
                      costImpact: riskCost,
                      probability: 'Medium',
                      owner: riskOwner,
                      ownerRole: 'Project Manager',
                      mitigation: riskMitigation.trim() || 'Monitor weekly in progress review.',
                      status: 'Open',
                    });
                    setRiskTitle('');
                    setRiskMitigation('');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0F2137] text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Risk</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Risk / Delay Cause</th>
                    <th className="text-left px-3 py-2 font-semibold">Owner</th>
                    <th className="text-right px-3 py-2 font-semibold">Impact</th>
                    <th className="text-left px-3 py-2 font-semibold">Mitigation</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-right px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {risks.map((rk) => (
                    <tr key={rk.id}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{rk.title}</div>
                        <div className="text-[11px] text-slate-500">
                          {rk.category} · {rk.probability} probability
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span>{rk.owner}</span>
                          <RoleBadge role={rk.ownerRole} compact />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <div>+{rk.impactDays}d</div>
                        <div className="text-[11px] text-slate-500">
                          {formatCompactCurrency(rk.costImpact, project.currency)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-xs">
                        {rk.mitigation}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={rk.status}
                          onChange={(e) =>
                            updateDelayRisk(rk.id, { status: e.target.value as DelayRiskItem['status'] })
                          }
                          className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        >
                          <option value="Open">Open</option>
                          <option value="Mitigated">Mitigated</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => deleteDelayRisk(rk.id)}
                          className="text-[11px] text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
