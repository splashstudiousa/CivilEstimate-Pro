import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Diamond,
  Download,
  GitBranch,
  RotateCcw,
  SlidersHorizontal,
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
import { formatCompactCurrency, formatCurrency } from '../../engine/formatters';
import { exportReportToExcel, exportReportToPDF } from '../../engine/exporters';
import { ActivityDependency, CPMTask } from '../../types/estimate';

export const TimePlanningGantt: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const updateBOQItem = useEstimateStore((s) => s.updateBOQItem);
  const updateActiveProject = useEstimateStore((s) => s.updateActiveProject);

  const [showBaseline, setShowBaseline] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(summary.tasks[0]?.boqItemId || '');
  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: 'move' | 'resize';
    startX: number;
    origOffset: number;
    origDur: number;
  } | null>(null);
  const [newPredId, setNewPredId] = useState('');
  const [newDepType, setNewDepType] = useState<'FS' | 'SS'>('FS');
  const [newDepLag, setNewDepLag] = useState(0);

  const pxPerDay = 18;
  const totalTimelineDays = Math.max(30, summary.totalDurationWorkingDays + 5);

  const selectedTask: CPMTask | undefined = useMemo(
    () => summary.tasks.find((t) => t.boqItemId === selectedTaskId) || summary.tasks[0],
    [summary.tasks, selectedTaskId]
  );

  const selectedBoqItem = project.boqItems.find((b) => b.id === selectedTask?.boqItemId);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const deltaDays = Math.round((e.clientX - dragState.startX) / pxPerDay);
    if (dragState.mode === 'move') {
      const nextOffset = Math.max(0, dragState.origOffset + deltaDays);
      updateBOQItem(dragState.taskId, { startOffsetDays: nextOffset });
    } else {
      const nextDur = Math.max(1, dragState.origDur + deltaDays);
      updateBOQItem(dragState.taskId, { manualDurationDays: nextDur });
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

  const criticalTasks = summary.tasks.filter((t) => t.isCritical).length;

  return (
    <div
      className="space-y-5"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Time Planning, CPM Gantt & Cash Flow
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Drag bars to shift start/duration · Critical path auto-computed ({criticalTasks} critical tasks ·{' '}
            {summary.totalDurationWorkingDays} working days / {summary.totalDurationCalendarDays} calendar days)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={showBaseline}
              onChange={(e) => setShowBaseline(e.target.checked)}
              className="accent-orange-600"
            />
            <span>Show Baseline</span>
          </label>
          <button
            type="button"
            onClick={() =>
              exportReportToExcel('gantt-schedule', project, summary, resources, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportReportToPDF('gantt-schedule', project, summary, companyProfile, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Schedule PDF</span>
          </button>
        </div>
      </div>

      {/* Calendar Settings Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-600" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">Workweek:</span>
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
              <option value={5}>5 days/wk (Mon–Fri)</option>
              <option value={6}>6 days/wk (Mon–Sat)</option>
              <option value={7}>7 days/wk (Continuous)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Weather Buffer:</span>
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
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-xs bg-orange-600 inline-block" /> Critical Path
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-xs bg-[#1E3A5F] inline-block" /> Normal Activity
          </span>
          {showBaseline && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-xs bg-slate-400 inline-block" /> Baseline
            </span>
          )}
        </div>
      </div>

      {/* Interactive Gantt + Inspector Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${360 + totalTimelineDays * pxPerDay}px` }}>
              {/* Timeline Header */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <div className="w-[340px] shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 flex justify-between">
                  <span>Activity</span>
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

              {/* Task Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 select-none">
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
                      <div className="w-[340px] shrink-0 px-3 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                          <span className="font-mono text-slate-400 mr-1.5">{task.itemNo}</span>
                          {task.name}
                        </div>
                        <div className="font-mono text-[11px] shrink-0 text-slate-500">
                          {task.isMilestone ? 'MS' : `${task.durationDays}d`} · F{task.totalFloat}
                        </div>
                      </div>

                      <div className="flex-1 relative h-full flex items-center">
                        {/* Baseline thin bar */}
                        {showBaseline && !task.isMilestone && (
                          <div
                            style={{ left: `${baseLeft}px`, width: `${baseWidth}px` }}
                            className="absolute bottom-1 h-1 bg-slate-400/60 rounded-full pointer-events-none"
                          />
                        )}

                        {task.isMilestone ? (
                          <div
                            style={{ left: `${barLeft}px` }}
                            title={`${task.name} (Day ${task.earlyStart + 1})`}
                            className="absolute flex items-center gap-1 text-orange-600"
                          >
                            <Diamond className="w-4 h-4 fill-orange-600" />
                            <span className="text-[10px] font-mono font-semibold">Milestone</span>
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
                                origOffset: project.boqItems.find((b) => b.id === task.boqItemId)?.startOffsetDays || 0,
                                origDur: task.durationDays,
                              });
                            }}
                            title="Drag horizontally to shift start offset"
                            className={`absolute h-5 rounded-sm flex items-center overflow-hidden cursor-grab active:cursor-grabbing ${
                              task.isCritical
                                ? 'bg-orange-600 text-white'
                                : 'bg-[#1E3A5F] text-white'
                            }`}
                          >
                            {/* Actual Progress Overlay */}
                            {task.actualProgressPct > 0 && (
                              <div
                                style={{ width: `${task.actualProgressPct}%` }}
                                className="h-full bg-emerald-500/45 pointer-events-none"
                              />
                            )}
                            <span className="px-1.5 text-[10px] font-mono whitespace-nowrap pointer-events-none">
                              {task.actualProgressPct > 0 ? `${task.actualProgressPct}%` : `${task.durationDays}d`}
                            </span>
                            {/* Resize handle */}
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
                              title="Drag right edge to resize duration"
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

        {/* Right: Activity Inspector & Dependency Editor */}
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
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedTask.name}
                  </h2>
                </div>
                <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Duration (Days)
                  </label>
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
                        title="Reset to auto-calculated duration"
                        onClick={() => updateBOQItem(selectedBoqItem.id, { manualDurationDays: undefined })}
                        className="p-1.5 text-slate-400 hover:text-orange-600"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Actual Progress %
                  </label>
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
                  <label className="block text-[11px] text-slate-500 mb-1">Crew Size</label>
                  <input
                    type="number"
                    min={1}
                    value={selectedBoqItem.crewSize}
                    onChange={(e) =>
                      updateBOQItem(selectedBoqItem.id, {
                        crewSize: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Start Offset (d)</label>
                  <input
                    type="number"
                    min={0}
                    value={selectedBoqItem.startOffsetDays || 0}
                    onChange={(e) =>
                      updateBOQItem(selectedBoqItem.id, {
                        startOffsetDays: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selectedBoqItem.isMilestone)}
                  onChange={(e) =>
                    updateBOQItem(selectedBoqItem.id, { isMilestone: e.target.checked })
                  }
                  className="accent-orange-600"
                />
                <span>Mark as Zero-Duration Milestone</span>
              </label>

              {/* Dependencies */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <GitBranch className="w-3.5 h-3.5 text-orange-600" />
                  <span>Predecessor Dependencies (FS / SS)</span>
                </div>

                <div className="space-y-1.5">
                  {selectedBoqItem.dependencies.length === 0 ? (
                    <div className="text-[11px] text-slate-400">Starts at project kickoff (Day 1).</div>
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

                <div className="grid grid-cols-12 gap-1.5 pt-1">
                  <select
                    value={newPredId}
                    onChange={(e) => setNewPredId(e.target.value)}
                    className="col-span-6 px-2 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    <option value="">Select predecessor...</option>
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
                    onChange={(e) => setNewDepType(e.target.value as 'FS' | 'SS')}
                    className="col-span-2 px-1.5 py-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    <option value="FS">FS</option>
                    <option value="SS">SS</option>
                  </select>
                  <input
                    type="number"
                    value={newDepLag}
                    onChange={(e) => setNewDepLag(Number(e.target.value) || 0)}
                    placeholder="Lag"
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
            <div className="text-xs text-slate-500">Select a task bar to inspect dependencies.</div>
          )}
        </div>
      </div>

      {/* Resource-Loaded Monthly Cash Flow & S-Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Resource-Loaded Monthly Cash Flow & Cumulative S-Curve
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Synchronized directly with BOQ cost & CPM activity dates
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
                <Area
                  type="monotone"
                  dataKey="plannedCumulativeCost"
                  name="Planned Cumulative"
                  stroke="#0F2137"
                  fill="#1E3A5F"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="plannedMonthlyCost"
                  name="Monthly Outflow"
                  stroke="#EA580C"
                  fill="#EA580C"
                  fillOpacity={0.22}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Monthly Peak Workforce Histogram
          </h2>
          <p className="text-xs text-slate-500 mb-3">Peak & average daily crew mobilization</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.cashFlow} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
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
                <Bar dataKey="peakManpower" name="Peak Workers" fill="#EA580C" radius={[3, 3, 0, 0]} />
                <Bar dataKey="avgManpower" name="Avg Workers" fill="#0F2137" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
