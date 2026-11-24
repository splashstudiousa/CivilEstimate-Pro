import React, { useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  History,
  MessageSquare,
  Plus,
  Send,
  XCircle,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { ApprovalStatus, TeamTaskItem, UserRole } from '../../types/estimate';
import { formatCurrency } from '../../engine/formatters';
import { hasModulePermission } from '../../data/roles';
import { RoleBadge } from '../common/RoleBadge';

export const CollaborationWorkflowModule: React.FC = () => {
  const { project, summary, userRole, activeRoleDef, roleDefinitions } = useActiveProject();
  const auditLog = useEstimateStore((s) => s.auditLog);
  const teamUsers = useEstimateStore((s) => s.teamUsers);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const advanceWorkflowStage = useEstimateStore((s) => s.advanceWorkflowStage);
  const updateProjectApprovalStatus = useEstimateStore((s) => s.updateProjectApprovalStatus);
  const addTeamTask = useEstimateStore((s) => s.addTeamTask);
  const updateTeamTask = useEstimateStore((s) => s.updateTeamTask);
  const addComment = useEstimateStore((s) => s.addComment);
  const markNotificationRead = useEstimateStore((s) => s.markNotificationRead);

  const [handoffNotes, setHandoffNotes] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState('');
  const [commentSection, setCommentSection] = useState('Cross-Department Workflow');
  const [taskFilter, setTaskFilter] = useState<'mine' | 'all'>('mine');

  // New task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskRole, setNewTaskRole] = useState<UserRole>('Estimator/QS');
  const [newTaskPriority, setNewTaskPriority] = useState<TeamTaskItem['priority']>('High');
  const [newTaskDue, setNewTaskDue] = useState('2026-11-30');

  const stages = project.workflowHandoffs || [];
  const tasks = project.teamTasks || [];
  const notifications = (project.notifications || []).filter(
    (n) => userRole === 'Admin' || n.targetRoles.includes(userRole)
  );

  const canApproveEstimate = hasModulePermission(
    userRole,
    'collaboration',
    'approve',
    roleDefinitions
  );
  const withinApprovalLimit =
    activeRoleDef.approvalLimit === -1 || summary.grandTotal <= activeRoleDef.approvalLimit;

  const visibleTasks =
    taskFilter === 'all' || userRole === 'Admin' || userRole === 'Project Manager'
      ? tasks
      : tasks.filter((t) => t.assigneeRole === userRole);

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment(commentText.trim(), commentSection);
    setCommentText('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{project.code}</span>
            <span aria-hidden="true">·</span>
            <span>{project.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Estimate Status: {project.approvalStatus}
            </span>
          </div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white mt-0.5">
            Cross-Department Workflow, Approvals & Activity Hub
          </h1>
        </div>

        {/* Approval Status Control */}
        <div className="flex flex-wrap items-center gap-2">
          {(['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'] as ApprovalStatus[]).map(
            (st) => {
              const isApprovalAction = st === 'Approved' || st === 'Rejected';
              const disabled =
                userRole === 'Client/Viewer' ||
                (isApprovalAction && (!canApproveEstimate || (st === 'Approved' && !withinApprovalLimit)));
              const active = project.approvalStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  disabled={disabled}
                  onClick={() => updateProjectApprovalStatus(st)}
                  title={
                    isApprovalAction && !withinApprovalLimit
                      ? `Estimate (${formatCurrency(summary.grandTotal, project.currency)}) exceeds ${userRole} approval limit (${formatCurrency(activeRoleDef.approvalLimit, project.currency)})`
                      : `Set estimate status to ${st}`
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? st === 'Approved'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : st === 'Rejected'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-orange-600 border-orange-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {st}
                </button>
              );
            }
          )}
        </div>
      </div>

      {!withinApprovalLimit && activeRoleDef.approvalLimit > 0 && canApproveEstimate && (
        <div className="px-4 py-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          Current estimate grand total ({formatCurrency(summary.grandTotal, project.currency)}) exceeds{' '}
          <strong>{userRole}</strong> financial approval limit (
          {formatCurrency(activeRoleDef.approvalLimit, project.currency)}). Escalate final sign-off to Project Manager or Admin.
        </div>
      )}

      {/* 5-Stage Cross-Department Handoff Pipeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Department Handoff Pipeline (Draftsman → Estimator → Planner → PM → Finance)
          </h2>
          <p className="text-xs text-slate-500">
            Advancing any stage automatically assigns a task and sends a notification to the next department.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {stages.map((st, idx) => {
            const canAct = userRole === 'Admin' || userRole === 'Project Manager' || userRole === st.role;
            return (
              <div
                key={st.id}
                className={`p-3.5 rounded-md border flex flex-col justify-between gap-3 ${
                  st.status === 'Approved'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/15'
                    : st.status === 'Rejected'
                    ? 'border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/15'
                    : st.status === 'Submitted' || st.status === 'Under Review' || st.status === 'In Progress'
                    ? 'border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-orange-950/15'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-slate-500">
                    <span>Step 0{st.order}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{st.status}</span>
                  </div>
                  <div className="mt-1.5">
                    <RoleBadge role={st.role} compact />
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mt-2">
                    {st.stageName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {st.handoffNote}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                  {canAct && userRole !== 'Client/Viewer' && (
                    <>
                      <input
                        type="text"
                        value={handoffNotes[st.id] || ''}
                        onChange={(e) =>
                          setHandoffNotes((prev) => ({ ...prev, [st.id]: e.target.value }))
                        }
                        placeholder="Handoff note..."
                        className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            advanceWorkflowStage(
                              st.id,
                              idx >= 3 ? 'Approved' : 'Submitted',
                              handoffNotes[st.id] || `${st.stageName} completed & handed off`
                            );
                            setHandoffNotes((p) => ({ ...p, [st.id]: '' }));
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[#0F2137] hover:bg-slate-800 text-white text-[11px] font-medium"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{idx < stages.length - 1 ? 'Handoff' : 'Approve'}</span>
                        </button>
                        {idx >= 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              advanceWorkflowStage(
                                st.id,
                                'Rejected',
                                handoffNotes[st.id] || 'Returned for revision'
                              )
                            }
                            className="px-2 py-1.5 rounded border border-red-200 dark:border-red-900 text-red-600 text-[11px]"
                            title="Reject / Return for revision"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveModule(st.targetModule)}
                    className="w-full inline-flex items-center justify-between text-[11px] text-orange-600 dark:text-orange-400 hover:underline pt-0.5"
                  >
                    <span>Open Module</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks & Notifications + Comments & Activity Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Task Assignment Queue & Role Notifications */}
        <div className="xl:col-span-7 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-600" />
                <span>Department Task Assignments ({visibleTasks.length})</span>
              </h2>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                <button
                  type="button"
                  onClick={() => setTaskFilter('mine')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                    taskFilter === 'mine'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  My Role
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('all')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                    taskFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  All Project Tasks
                </button>
              </div>
            </div>

            {userRole !== 'Client/Viewer' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Assign new task with due date..."
                  className="sm:col-span-5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <select
                  value={newTaskRole}
                  onChange={(e) => setNewTaskRole(e.target.value as UserRole)}
                  className="sm:col-span-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  {roleDefinitions.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as TeamTaskItem['priority'])}
                  className="sm:col-span-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!newTaskTitle.trim()) return;
                    const roleDef = roleDefinitions.find((r) => r.name === newTaskRole);
                    const assignee =
                      teamUsers.find((u) => u.assignedRoles.includes(newTaskRole))?.name ||
                      'Assigned Lead';
                    addTeamTask({
                      title: newTaskTitle.trim(),
                      description: `Assigned by ${userRole}`,
                      status: 'Backlog',
                      priority: newTaskPriority,
                      assignedTo: assignee,
                      assigneeRole: newTaskRole,
                      department: roleDef?.department || 'Engineering',
                      dueDate: newTaskDue,
                    });
                    setNewTaskTitle('');
                  }}
                  className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-orange-600 text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign</span>
                </button>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {visibleTasks.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {t.title}
                      </span>
                      <RoleBadge role={t.assigneeRole} compact />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {t.assignedTo} · Due <span className="font-mono">{t.dueDate}</span> · Priority:{' '}
                      <span className={t.priority === 'Critical' ? 'text-red-600 font-semibold' : ''}>
                        {t.priority}
                      </span>
                    </div>
                  </div>
                  <select
                    value={t.status}
                    disabled={userRole === 'Client/Viewer'}
                    onChange={(e) =>
                      updateTeamTask(t.id, { status: e.target.value as TeamTaskItem['status'] })
                    }
                    className="px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shrink-0"
                  >
                    <option value="Backlog">Backlog</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Blocked">Blocked</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Role Notifications */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-600" />
              <span>Notifications for {userRole} ({notifications.length})</span>
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
              {notifications.map((n) => (
                <div key={n.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <RoleBadge role={n.fromRole} compact />
                      <span className="font-semibold text-slate-900 dark:text-white">{n.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{n.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationRead(n.id);
                      setActiveModule(n.module);
                    }}
                    className="text-[11px] font-medium text-orange-600 hover:underline shrink-0"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: @Mentions Comments & Project Activity Feed */}
        <div className="xl:col-span-5 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-600" />
              <span>Discussion & @Mentions</span>
            </h2>

            {userRole !== 'Client/Viewer' && (
              <form onSubmit={handlePostComment} className="space-y-2 text-xs">
                <div className="flex flex-wrap gap-1">
                  {['Project Manager', 'Estimator/QS', 'Project Planner', 'Draftsman/CAD Technician', 'Finance/Accounts'].map(
                    (r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCommentText((t) => `${t}${t ? ' ' : ''}@${r} `)}
                        className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        @{r.split('/')[0]}
                      </button>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Comment with @Role mention to notify..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded bg-orange-600 text-white font-semibold"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
              {project.comments.map((c) => (
                <div key={c.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 dark:text-white">{c.author}</span>
                      <RoleBadge role={c.role} compact />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">{c.timestamp.slice(0, 10)}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{c.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-orange-600" />
              <span>Project Activity Feed</span>
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto text-xs">
              {auditLog.slice(0, 20).map((entry) => (
                <div key={entry.id} className="py-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white">{entry.action}</span>
                      {entry.userRole && <RoleBadge role={entry.userRole} compact />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{entry.details}</div>
                    <div className="text-[10px] text-slate-400">{entry.user}</div>
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
    </div>
  );
};
