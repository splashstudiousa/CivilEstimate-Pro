import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CPMTask } from '../../types/estimate';

interface TaskBurnUpSummaryProps {
  tasks: CPMTask[];
  statusDay: number;
  totalWorkingDays: number;
  startDate: string;
  workingDaysPerWeek?: number;
  onOpenSchedule?: () => void;
  onOpenSetup?: () => void;
}

type BurnUpMode = 'count' | 'weighted';
type TaskStatusFilter = 'all' | 'completed' | 'active' | 'behind';

interface BurnUpPoint {
  day: number;
  label: string;
  dateLabel: string;
  scope: number;
  baseline: number;
  completed: number | null;
  forecast: number | null;
  finishedBaselineLabels: string[];
  finishedActualLabels: string[];
}

function addWorkingDaysToDate(startIso: string, workingDay: number, workingDaysPerWeek: number): string {
  const base = new Date(startIso || '2026-11-01');
  if (Number.isNaN(base.getTime())) return `Day ${workingDay}`;
  const ratio = 7 / Math.max(1, Math.min(7, workingDaysPerWeek || 6));
  const calDays = Math.round(workingDay * ratio);
  const dt = new Date(base.getTime() + calDays * 86400000);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const TaskBurnUpSummary: React.FC<TaskBurnUpSummaryProps> = ({
  tasks,
  statusDay,
  totalWorkingDays,
  startDate,
  workingDaysPerWeek = 6,
  onOpenSchedule,
  onOpenSetup,
}) => {
  const [mode, setMode] = useState<BurnUpMode>('count');
  const [listFilter, setListFilter] = useState<TaskStatusFilter>('all');

  const computed = useMemo(() => {
    if (tasks.length === 0) {
      return {
        points: [] as BurnUpPoint[],
        horizonDay: 1,
        totalTasks: 0,
        completedCount: 0,
        inProgressCount: 0,
        notStartedCount: 0,
        baselinePlannedAtStatus: 0,
        baselineWeightedAtStatus: 0,
        actualWeightedAtStatus: 0,
        behindBaselineCount: 0,
        taskRows: [] as Array<{
          task: CPMTask;
          baselineFinish: number;
          isCompleted: boolean;
          isBehindBaseline: boolean;
          statusLabel: 'Completed' | 'Behind Baseline' | 'In Progress' | 'Scheduled';
        }>,
      };
    }

    const totalTasks = tasks.length;
    const maxBaselineFinish = Math.max(
      1,
      ...tasks.map((t) => t.baselineStartDay + t.baselineDurationDays)
    );
    const maxActualFinish = Math.max(1, ...tasks.map((t) => t.earlyFinish));
    const horizonDay = Math.max(1, totalWorkingDays, maxBaselineFinish, maxActualFinish, statusDay);

    const step = horizonDay <= 32 ? 1 : horizonDay <= 75 ? 2 : Math.ceil(horizonDay / 36);
    const daySet = new Set<number>([0, statusDay, horizonDay]);
    for (let d = 0; d <= horizonDay; d += step) {
      daySet.add(d);
    }
    const days = Array.from(daySet).sort((a, b) => a - b);

    const taskRows = tasks
      .map((t) => {
        const baselineFinish = t.baselineStartDay + t.baselineDurationDays;
        const isCompleted = t.actualProgressPct >= 100;
        const isBehindBaseline = !isCompleted && baselineFinish <= statusDay;
        const statusLabel: 'Completed' | 'Behind Baseline' | 'In Progress' | 'Scheduled' =
          isCompleted
            ? 'Completed'
            : isBehindBaseline
            ? 'Behind Baseline'
            : t.actualProgressPct > 0
            ? 'In Progress'
            : 'Scheduled';
        return {
          task: t,
          baselineFinish,
          isCompleted,
          isBehindBaseline,
          statusLabel,
        };
      })
      .sort((a, b) => {
        const rank = { 'Behind Baseline': 0, 'In Progress': 1, Completed: 2, Scheduled: 3 };
        if (rank[a.statusLabel] !== rank[b.statusLabel]) {
          return rank[a.statusLabel] - rank[b.statusLabel];
        }
        return a.baselineFinish - b.baselineFinish;
      });

    const completedCount = taskRows.filter((r) => r.isCompleted).length;
    const inProgressCount = taskRows.filter((r) => !r.isCompleted && r.task.actualProgressPct > 0).length;
    const notStartedCount = totalTasks - completedCount - inProgressCount;
    const behindBaselineCount = taskRows.filter((r) => r.isBehindBaseline).length;

    const baselinePlannedAtStatus = tasks.filter((t) => {
      const bf = t.baselineStartDay + t.baselineDurationDays;
      return bf <= statusDay;
    }).length;

    const calcWeightedBaselineAt = (d: number): number => {
      let sum = 0;
      for (const t of tasks) {
        if (t.baselineDurationDays <= 0) {
          sum += d >= t.baselineStartDay ? 1 : 0;
        } else {
          const frac = Math.max(0, Math.min(1, (d - t.baselineStartDay) / t.baselineDurationDays));
          sum += frac;
        }
      }
      return Math.round((sum / totalTasks) * 1000) / 10;
    };

    const calcWeightedActualAt = (d: number): number => {
      let sum = 0;
      for (const t of tasks) {
        if (t.actualProgressPct <= 0) continue;
        const tStart = Math.min(Math.max(0, statusDay - 1), Math.max(0, t.earlyStart));
        const tEnd = Math.min(statusDay, Math.max(tStart + 1, t.earlyFinish));
        const span = Math.max(1, tEnd - tStart);
        const frac = d >= tEnd ? 1 : Math.max(0, Math.min(1, (d - tStart) / span));
        sum += (t.actualProgressPct / 100) * frac;
      }
      return Math.round((sum / totalTasks) * 1000) / 10;
    };

    const calcWeightedForecastAt = (d: number): number => {
      let sum = 0;
      for (const t of tasks) {
        const cur = t.actualProgressPct / 100;
        if (cur >= 1) {
          sum += 1;
          continue;
        }
        const remEnd = Math.max(statusDay + 1, t.earlyFinish);
        if (d <= statusDay) {
          sum += cur;
        } else if (d >= remEnd) {
          sum += 1;
        } else {
          const span = Math.max(1, remEnd - statusDay);
          const frac = (d - statusDay) / span;
          sum += cur + (1 - cur) * frac;
        }
      }
      return Math.round((sum / totalTasks) * 1000) / 10;
    };

    const points: BurnUpPoint[] = days.map((d, idx) => {
      const prevD = idx > 0 ? days[idx - 1] : -1;
      const finishedBaselineLabels = tasks
        .filter((t) => {
          const bf = t.baselineStartDay + t.baselineDurationDays;
          return bf > prevD && bf <= d;
        })
        .map((t) => t.itemNo);

      const finishedActualLabels = tasks
        .filter((t) => {
          if (t.actualProgressPct < 100 || d > statusDay) return false;
          const af = Math.min(statusDay, Math.max(t.isMilestone ? 0 : 1, t.earlyFinish));
          return af > prevD && af <= d;
        })
        .map((t) => t.itemNo);

      if (mode === 'count') {
        const baselineVal = tasks.filter((t) => {
          const bf = t.baselineStartDay + t.baselineDurationDays;
          return bf <= d;
        }).length;

        const completedVal =
          d <= statusDay
            ? tasks.filter((t) => {
                if (t.actualProgressPct < 100) return false;
                const af = Math.min(statusDay, Math.max(t.isMilestone ? 0 : 1, t.earlyFinish));
                return af <= d;
              }).length
            : null;

        const forecastVal =
          d >= statusDay
            ? tasks.filter((t) => {
                if (t.actualProgressPct >= 100) return true;
                const remFinish = Math.max(statusDay + 1, t.earlyFinish);
                return remFinish <= d;
              }).length
            : null;

        return {
          day: d,
          label: `D${d}`,
          dateLabel: addWorkingDaysToDate(startDate, d, workingDaysPerWeek),
          scope: totalTasks,
          baseline: baselineVal,
          completed: completedVal,
          forecast: forecastVal,
          finishedBaselineLabels,
          finishedActualLabels,
        };
      }

      return {
        day: d,
        label: `D${d}`,
        dateLabel: addWorkingDaysToDate(startDate, d, workingDaysPerWeek),
        scope: 100,
        baseline: calcWeightedBaselineAt(d),
        completed: d <= statusDay ? calcWeightedActualAt(d) : null,
        forecast: d >= statusDay ? calcWeightedForecastAt(d) : null,
        finishedBaselineLabels,
        finishedActualLabels,
      };
    });

    return {
      points,
      horizonDay,
      totalTasks,
      completedCount,
      inProgressCount,
      notStartedCount,
      baselinePlannedAtStatus,
      baselineWeightedAtStatus: calcWeightedBaselineAt(statusDay),
      actualWeightedAtStatus: calcWeightedActualAt(statusDay),
      behindBaselineCount,
      taskRows,
    };
  }, [tasks, statusDay, totalWorkingDays, startDate, workingDaysPerWeek, mode]);

  const filteredTaskRows = useMemo(() => {
    return computed.taskRows.filter((r) => {
      if (listFilter === 'completed') return r.isCompleted;
      if (listFilter === 'active') return !r.isCompleted && r.task.actualProgressPct > 0;
      if (listFilter === 'behind') return r.isBehindBaseline;
      return true;
    });
  }, [computed.taskRows, listFilter]);

  if (tasks.length === 0) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Task Burn-Up Summary vs. Baseline Gantt Plan
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          No scheduled BOQ tasks exist yet. Add work items to generate the baseline Gantt plan and track completed tasks.
        </p>
        {onOpenSetup && (
          <button
            type="button"
            onClick={onOpenSetup}
            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 text-white text-xs font-semibold"
          >
            <span>Configure Project BOQ</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </section>
    );
  }

  const varianceCount = computed.completedCount - computed.baselinePlannedAtStatus;
  const variancePct =
    Math.round((computed.actualWeightedAtStatus - computed.baselineWeightedAtStatus) * 10) / 10;

  const isOnOrAhead = mode === 'count' ? varianceCount >= 0 : variancePct >= 0;

  return (
    <section
      aria-label="Task Burn-Up Summary View"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Task Burn-Up Summary vs. Baseline Gantt Plan
            </h2>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Status Day {statusDay} of {computed.horizonDay}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cumulative completed Gantt activities against baseline schedule commitments and remaining forecast trajectory
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700"
            role="group"
            aria-label="Burn-up metric mode"
          >
            <button
              type="button"
              onClick={() => setMode('count')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                mode === 'count'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tasks Completed
            </button>
            <button
              type="button"
              onClick={() => setMode('weighted')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                mode === 'weighted'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Progress-Weighted (%)
            </button>
          </div>

          {onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 whitespace-nowrap"
            >
              <span>Open Baseline Gantt</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Hairline-divided 4-column Summary Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800 py-3">
        <div className="pr-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Completed Tasks</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {computed.completedCount} / {computed.totalTasks}
            </span>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              ({Math.round((computed.completedCount / computed.totalTasks) * 100)}%)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {computed.inProgressCount} active · {computed.notStartedCount} upcoming
          </div>
        </div>

        <div className="lg:px-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Baseline Plan (Day {statusDay})
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-mono font-bold tabular-nums text-sky-700 dark:text-sky-400">
              {mode === 'count'
                ? `${computed.baselinePlannedAtStatus} tasks`
                : `${computed.baselineWeightedAtStatus.toFixed(1)}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {mode === 'count'
              ? `${computed.baselineWeightedAtStatus.toFixed(1)}% weighted baseline`
              : `${computed.baselinePlannedAtStatus} discrete finishes scheduled`}
          </div>
        </div>

        <div className="lg:px-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Actual Burn-Up (Day {statusDay})
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-mono font-bold tabular-nums text-orange-600 dark:text-orange-400">
              {mode === 'count'
                ? `${computed.completedCount} tasks`
                : `${computed.actualWeightedAtStatus.toFixed(1)}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Weighted completion: {computed.actualWeightedAtStatus.toFixed(1)}%
          </div>
        </div>

        <div className="lg:pl-4 py-1">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Variance vs. Baseline Gantt
          </div>
          <div
            className={`mt-0.5 flex items-center gap-1.5 text-base font-mono font-bold tabular-nums ${
              isOnOrAhead
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isOnOrAhead ? (
              <TrendingUp className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>
              {mode === 'count'
                ? `${varianceCount > 0 ? '+' : ''}${varianceCount} tasks`
                : `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {isOnOrAhead
              ? 'On or ahead of baseline plan'
              : `${computed.behindBaselineCount} task(s) past baseline finish`}
          </div>
        </div>
      </div>

      {/* Main Chart + Task Status Summary Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Burn-Up Chart (8 cols) */}
        <div className="xl:col-span-8 min-h-[280px] flex flex-col">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={computed.points}
                margin={{ top: 12, right: 18, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="burnupBaselineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284C7" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#0284C7" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="burnupCompletedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EA580C" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#EA580C" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={[0, computed.horizonDay]}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(d) => `D${d}`}
                />
                <YAxis
                  domain={[0, mode === 'count' ? computed.totalTasks : 100]}
                  allowDecimals={mode === 'weighted'}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => (mode === 'weighted' ? `${v}%` : `${v}`)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0].payload as BurnUpPoint;
                    const unitSuffix = mode === 'weighted' ? '%' : ' tasks';
                    const actualVal = pt.completed !== null ? pt.completed : pt.forecast;
                    const delta =
                      actualVal !== null
                        ? Math.round((actualVal - pt.baseline) * 10) / 10
                        : null;
                    return (
                      <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2.5 text-xs text-slate-100 shadow-lg space-y-1.5 min-w-[210px]">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-1">
                          <span className="font-mono font-bold">
                            Day {pt.day} ({pt.dateLabel})
                          </span>
                          {pt.day === statusDay && (
                            <span className="text-[10px] font-semibold text-orange-400">
                              Status Day
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Total Scope</span>
                          <span className="font-mono tabular-nums">
                            {pt.scope}
                            {unitSuffix}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sky-400">Baseline Gantt Plan</span>
                          <span className="font-mono font-semibold tabular-nums">
                            {pt.baseline}
                            {unitSuffix}
                          </span>
                        </div>
                        {pt.completed !== null && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-orange-400">Completed Actual</span>
                            <span className="font-mono font-semibold tabular-nums">
                              {pt.completed}
                              {unitSuffix}
                            </span>
                          </div>
                        )}
                        {pt.day > statusDay && pt.forecast !== null && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-emerald-400">Forecast Trajectory</span>
                            <span className="font-mono font-semibold tabular-nums">
                              {pt.forecast}
                              {unitSuffix}
                            </span>
                          </div>
                        )}
                        {delta !== null && (
                          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-[11px]">
                            <span className="text-slate-400">Variance vs. Baseline</span>
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                delta >= 0 ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {delta > 0 ? '+' : ''}
                              {delta}
                              {unitSuffix}
                            </span>
                          </div>
                        )}
                        {pt.finishedBaselineLabels.length > 0 && (
                          <div className="text-[10px] text-slate-400 pt-0.5">
                            Baseline finish: {pt.finishedBaselineLabels.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />

                <ReferenceLine
                  x={statusDay}
                  stroke="#EA580C"
                  strokeDasharray="4 4"
                  label={{
                    value: `Status D${statusDay}`,
                    position: 'insideTopRight',
                    fill: '#EA580C',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="scope"
                  name="Total Task Scope"
                  stroke="#64748B"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />

                <Area
                  type={mode === 'count' ? 'stepAfter' : 'monotone'}
                  dataKey="baseline"
                  name="Baseline Gantt Plan"
                  stroke="#0284C7"
                  strokeWidth={2}
                  fill="url(#burnupBaselineFill)"
                  dot={false}
                />

                <Area
                  type={mode === 'count' ? 'stepAfter' : 'monotone'}
                  dataKey="completed"
                  name="Completed Tasks (Actual)"
                  stroke="#EA580C"
                  strokeWidth={2.5}
                  fill="url(#burnupCompletedFill)"
                  connectNulls={false}
                  dot={{ r: 2.5, fill: '#EA580C' }}
                />

                <Line
                  type={mode === 'count' ? 'stepAfter' : 'monotone'}
                  dataKey="forecast"
                  name="Current Gantt Forecast"
                  stroke="#16A34A"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  connectNulls={false}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Task Status List vs Baseline Finish (4 cols) */}
        <div className="xl:col-span-4 flex flex-col border-t xl:border-t-0 xl:border-l border-slate-200 dark:border-slate-800 pt-4 xl:pt-0 xl:pl-5">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              Gantt Deliverable Status
            </span>
            <div className="flex items-center gap-1 text-[11px]">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'behind', label: `Slip (${computed.behindBaselineCount})` },
                  { id: 'completed', label: 'Done' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setListFilter(tab.id)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
                    listFilter === tab.id
                      ? 'bg-[#0F2137] text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-1 flex-1">
            {filteredTaskRows.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No tasks match this filter.
              </div>
            ) : (
              filteredTaskRows.map(({ task, baselineFinish, statusLabel }) => (
                <div key={task.boqItemId} className="py-2 flex items-center justify-between gap-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      <span className="font-mono text-slate-500 mr-1.5">{task.itemNo}</span>
                      {task.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {statusLabel === 'Completed' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      ) : statusLabel === 'Behind Baseline' ? (
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      ) : (
                        <Clock className="w-3 h-3 text-sky-600 shrink-0" />
                      )}
                      <span>{statusLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        BL D{baselineFinish} / Plan D{task.earlyFinish}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-12">
                    <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {task.actualProgressPct}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
