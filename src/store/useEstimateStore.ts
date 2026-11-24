import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ApprovalStatus,
  AttendanceRecord,
  AuditEntry,
  BOQItem,
  CompanyProfile,
  CountryCode,
  DailySiteReport,
  DelayRiskItem,
  DrawingFile,
  DrawingMarkup,
  DrawingPipelineRun,
  DrawingRegisterItem,
  DrawingType,
  EstimateRevision,
  MeasurementRow,
  NavModule,
  PipelineExtractedElement,
  PipelineMappingMemory,
  PipelineTemplate,
  Project,
  ProjectComment,
  ProjectVisibility,
  PurchaseRequisition,
  QAChecklistItem,
  RABill,
  RateAnalysis,
  ResourceRate,
  RoleDefinition,
  RoleNotification,
  ScaleCalibration,
  ScheduleScenario,
  TeamTaskItem,
  TeamUser,
  UnitSystem,
  UserRole,
  UserWorkspaceMemory,
  VendorInvoice,
  WBSNode,
} from '../types/estimate';
import { SAMPLE_HOUSE_PROJECT } from '../data/sampleProject';
import { DEFAULT_RESOURCES } from '../data/resources';
import { PROJECT_TEMPLATES } from '../data/templates';
import { DEFAULT_ROLE_DEFINITIONS, DEFAULT_TEAM_USERS, getRoleDefinition } from '../data/roles';
import { hydrateProjectOperationalData } from '../data/sampleOperationalData';
import { computeProjectSummary } from '../engine/calculations';

interface HistorySnapshot {
  projects: Project[];
  resources: ResourceRate[];
}

interface EstimateState {
  activeModule: NavModule;
  theme: 'light' | 'dark';
  unitSystem: UnitSystem;
  userRole: UserRole;
  activeUserId: string;
  roleDefinitions: RoleDefinition[];
  teamUsers: TeamUser[];
  globalSearch: string;
  activeProjectId: string;
  activeTraceTarget: {
    drawingId: string;
    drawingName?: string;
    page: number;
    bbox?: { xPct: number; yPct: number; wPct: number; hPct: number };
    label?: string;
  } | null;
  projects: Project[];
  userMemories: Record<string, UserWorkspaceMemory>;
  resources: ResourceRate[];
  companyProfile: CompanyProfile;
  auditLog: AuditEntry[];
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Navigation & UI
  setActiveModule: (module: NavModule) => void;
  toggleTheme: () => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setUserRole: (role: UserRole) => void;
  setActiveUserId: (userId: string) => void;
  setGlobalSearch: (q: string) => void;
  setActiveProject: (id: string) => void;
  setActiveTraceTarget: (target: EstimateState['activeTraceTarget']) => void;
  updateUserMemory: (patch: Partial<UserWorkspaceMemory>) => void;
  clearUserMemory: (userId?: string) => void;

  // Role & User Governance
  addCustomRole: (role: Omit<RoleDefinition, 'id'>) => void;
  updateRoleDefinition: (roleId: string, patch: Partial<RoleDefinition>) => void;
  updateTeamUser: (userId: string, patch: Partial<TeamUser>) => void;
  addTeamUser: (user: Omit<TeamUser, 'id'>) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Project CRUD & Setup
  updateActiveProject: (patch: Partial<Project>, logAction?: string) => void;
  createProjectFromTemplate: (
    templateId: string,
    customName?: string,
    country?: CountryCode,
    visibility?: ProjectVisibility
  ) => void;
  setProjectVisibility: (
    projectId: string,
    visibility: ProjectVisibility,
    sharedWithUserIds?: string[]
  ) => void;
  duplicateActiveProject: () => void;
  deleteProject: (projectId: string) => void;

  // Measurements
  addMeasurement: (row: Omit<MeasurementRow, 'id'>) => string;
  updateMeasurement: (id: string, patch: Partial<MeasurementRow>) => void;
  deleteMeasurement: (id: string) => void;
  bulkAddMeasurements: (rows: Omit<MeasurementRow, 'id'>[]) => void;

  // BOQ Items
  addBOQItem: (item: Omit<BOQItem, 'id'>) => string;
  updateBOQItem: (id: string, patch: Partial<BOQItem>) => void;
  deleteBOQItem: (id: string) => void;
  duplicateBOQItem: (id: string) => void;
  bulkUpdateBOQItems: (ids: string[], patch: Partial<BOQItem>) => void;

  // Rate Analysis & Resources
  upsertRateAnalysis: (ra: RateAnalysis) => void;
  updateResourceRate: (id: string, patch: Partial<ResourceRate>) => void;
  addResourceRate: (res: Omit<ResourceRate, 'id'>) => void;
  importResourceRates: (list: Omit<ResourceRate, 'id'>[]) => void;

  // Drawings & Takeoff
  addDrawing: (drawing: DrawingFile) => void;
  deleteDrawing: (drawingId: string) => void;
  setDrawingCalibration: (drawingId: string, calibration: ScaleCalibration) => void;
  addDrawingMarkup: (drawingId: string, markup: Omit<DrawingMarkup, 'id'>) => string;
  deleteDrawingMarkup: (drawingId: string, markupId: string) => void;

  // Project Planner (WBS, Scenarios, Risks, Resource Leveling)
  addWBSNode: (node: Omit<WBSNode, 'id'>) => void;
  deleteWBSNode: (nodeId: string) => void;
  addScheduleScenario: (scenario: Omit<ScheduleScenario, 'id' | 'createdAt'>) => void;
  deleteScheduleScenario: (scenarioId: string) => void;
  addDelayRisk: (risk: Omit<DelayRiskItem, 'id'>) => void;
  updateDelayRisk: (riskId: string, patch: Partial<DelayRiskItem>) => void;
  deleteDelayRisk: (riskId: string) => void;
  levelScheduleResources: (maxCapacity?: number) => void;

  // Departmental Operations & Cross-Department Workflow
  addDrawingRegisterItem: (item: Omit<DrawingRegisterItem, 'id'>) => void;
  updateDrawingRegisterItem: (id: string, patch: Partial<DrawingRegisterItem>) => void;
  fulfillDrawingRequest: (reqId: string) => void;
  addTeamTask: (task: Omit<TeamTaskItem, 'id'>) => void;
  updateTeamTask: (taskId: string, patch: Partial<TeamTaskItem>) => void;
  deleteTeamTask: (taskId: string) => void;
  addAttendanceRecord: (rec: Omit<AttendanceRecord, 'id'>) => void;
  submitDailySiteReport: (rep: Omit<DailySiteReport, 'id' | 'syncedToSchedule' | 'status'>, autoSync?: boolean) => void;
  verifyAndSyncDailyReport: (repId: string) => void;
  toggleQAChecklist: (qaId: string, result: QAChecklistItem['result']) => void;
  addQAChecklist: (qa: Omit<QAChecklistItem, 'id'>) => void;
  addRABill: (bill: Omit<RABill, 'id'>) => void;
  updateRABillStatus: (billId: string, status: RABill['status']) => void;
  updateVendorInvoiceStatus: (invId: string, status: VendorInvoice['status']) => void;
  addPurchaseRequisition: (pr: Omit<PurchaseRequisition, 'id'>) => void;
  selectVendorQuoteAndIssuePO: (prId: string, vendorName: string) => void;
  updateDeliveryStatus: (prId: string, deliveryStatus: PurchaseRequisition['deliveryStatus']) => void;
  advanceWorkflowStage: (stageId: string, nextStatus: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected', note: string) => void;
  updateProjectApprovalStatus: (status: ApprovalStatus, note?: string) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;

  // Drawing-to-Estimate Pipeline
  commitPipelineToEstimate: (payload: {
    revisionLabel: string;
    drawingType: DrawingType;
    elements: PipelineExtractedElement[];
    newDrawings?: DrawingFile[];
    rememberMappings?: boolean;
    auditEntries?: Array<{ action: string; details: string }>;
  }) => { runId: string; grandTotalBefore: number; grandTotalAfter: number; durationBefore: number; durationAfter: number };
  savePipelineTemplate: (template: Omit<PipelineTemplate, 'id'>) => void;
  deletePipelineTemplate: (templateId: string) => void;
  notifyDraftsmanRevisionUpload: (sheetNames: string[], revisionLabel: string) => void;

  // Revisions, Comments, Settings
  createRevision: (label: string, notes: string) => void;
  addComment: (text: string, targetSection: string) => void;
  updateCompanyProfile: (patch: Partial<CompanyProfile>) => void;
  restoreBackup: (payload: { projects: Project[]; resources: ResourceRate[]; companyProfile?: CompanyProfile }) => void;
  resetDemoData: () => void;
}

const DEFAULT_COMPANY: CompanyProfile = {
  companyName: 'AEC Solutions Consultancy',
  tagline: 'Civil Structural & Quantity Surveying Practice',
  address: '420 Meridian Engineering Plaza, Suite 600',
  phone: '+92 42 3574 8810',
  email: 'estimates@aecsolutions.pro',
  licenseNo: 'PEC-CONSULT-88412',
  preparedBy: 'Eleanor Vance, PE',
  reviewedBy: 'Marcus Sterling, PMP',
  approvedBy: 'Zaim Farooq',
};

function makeAudit(
  user: string,
  action: string,
  details: string,
  userRole?: UserRole
): AuditEntry {
  return {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toISOString(),
    user,
    userRole,
    action,
    details,
  };
}

export function canUserAccessProject(project: Project, userId: string): boolean {
  if (!project.visibility || project.visibility === 'team') return true;
  if (project.ownerUserId === userId) return true;
  return Array.isArray(project.sharedWithUserIds) && project.sharedWithUserIds.includes(userId);
}

function createEmptyUserMemory(userId: string): UserWorkspaceMemory {
  return {
    userId,
    defaultProjectVisibility: 'team',
    personalNotes: '',
    pipelineMappingMemory: [],
    pipelineTemplates: [],
    updatedAt: new Date().toISOString(),
  };
}

export const useEstimateStore = create<EstimateState>()(
  persist(
    (set, get) => {
      const pushHistory = (state: EstimateState): Partial<EstimateState> => ({
        past: [
          ...state.past.slice(-29),
          {
            projects: JSON.parse(JSON.stringify(state.projects)),
            resources: JSON.parse(JSON.stringify(state.resources)),
          },
        ],
        future: [],
      });

      const mapActiveProject = (
        state: EstimateState,
        updater: (p: Project) => Project
      ): Project[] =>
        state.projects.map((p) => {
          if (p.id !== state.activeProjectId) return p;
          const hydrated = hydrateProjectOperationalData(p);
          return { ...updater(hydrated), updatedAt: new Date().toISOString() };
        });

      const currentActorName = (s: EstimateState) => {
        const u = s.teamUsers.find((usr) => usr.id === s.activeUserId);
        return u ? u.name : s.companyProfile.preparedBy;
      };

      const pushNotification = (
        p: Project,
        notif: Omit<RoleNotification, 'id' | 'createdAt' | 'readByRoles'>
      ): RoleNotification[] => [
        {
          ...notif,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          createdAt: new Date().toISOString(),
          readByRoles: [],
        },
        ...(p.notifications || []).slice(0, 49),
      ];

      const patchUserMem = (
        state: EstimateState,
        userId: string,
        patch: Partial<UserWorkspaceMemory>
      ): Record<string, UserWorkspaceMemory> => {
        const existing = state.userMemories[userId] || createEmptyUserMemory(userId);
        return {
          ...state.userMemories,
          [userId]: {
            ...existing,
            ...patch,
            userId,
            updatedAt: new Date().toISOString(),
          },
        };
      };

      const pickFallbackProjectId = (projects: Project[], userId: string): string => {
        const owned = projects.find((p) => p.ownerUserId === userId && canUserAccessProject(p, userId));
        if (owned) return owned.id;
        const accessible = projects.find((p) => canUserAccessProject(p, userId));
        return accessible?.id || projects[0]?.id || SAMPLE_HOUSE_PROJECT.id;
      };

      return {
        activeModule: 'dashboard',
        theme: 'light',
        unitSystem: 'imperial',
        userRole: 'Admin',
        activeUserId: 'usr-1',
        roleDefinitions: DEFAULT_ROLE_DEFINITIONS,
        teamUsers: DEFAULT_TEAM_USERS,
        globalSearch: '',
        activeProjectId: SAMPLE_HOUSE_PROJECT.id,
        activeTraceTarget: null,
        projects: [{ ...SAMPLE_HOUSE_PROJECT, visibility: 'team' }],
        userMemories: {
          'usr-1': {
            userId: 'usr-1',
            activeProjectId: SAMPLE_HOUSE_PROJECT.id,
            activeModule: 'dashboard',
            preferredRole: 'Admin',
            unitSystem: 'imperial',
            theme: 'light',
            defaultProjectVisibility: 'team',
            personalNotes: '',
            pipelineMappingMemory: [],
            pipelineTemplates: [],
            updatedAt: new Date().toISOString(),
          },
        },
        resources: DEFAULT_RESOURCES,
        companyProfile: DEFAULT_COMPANY,
        auditLog: [
          makeAudit(
            'Eleanor Vance, PE',
            'Project Initialized',
            'Loaded Oakridge 2-Storey Residential Villa (Rev 0 baseline)',
            'Estimator/QS'
          ),
          makeAudit(
            'Sana Qureshi',
            'Drawings Issued IFC',
            'AR-GF-01 Rev C & ST-FD-01 Rev C transmitted to QS',
            'Draftsman/CAD Technician'
          ),
          makeAudit(
            'Marcus Sterling, PMP',
            'Approval Review Started',
            'Reviewing master CPM schedule & risk register',
            'Project Manager'
          ),
        ],
        past: [],
        future: [],

        setActiveModule: (activeModule) =>
          set((s) => ({
            activeModule,
            userMemories: patchUserMem(s, s.activeUserId, { activeModule }),
          })),
        setActiveTraceTarget: (activeTraceTarget) => set({ activeTraceTarget }),

        toggleTheme: () =>
          set((s) => {
            const next = s.theme === 'light' ? 'dark' : 'light';
            return {
              theme: next,
              userMemories: patchUserMem(s, s.activeUserId, { theme: next }),
            };
          }),

        setUnitSystem: (unitSystem) =>
          set((s) => ({
            unitSystem,
            userMemories: patchUserMem(s, s.activeUserId, { unitSystem }),
          })),

        setUserRole: (userRole) =>
          set((s) => {
            const def = getRoleDefinition(userRole, s.roleDefinitions);
            const canKeepModule = def.sidebarModules.includes(s.activeModule);
            const nextModule = canKeepModule ? s.activeModule : 'dashboard';
            return {
              userRole,
              activeModule: nextModule,
              userMemories: patchUserMem(s, s.activeUserId, {
                preferredRole: userRole,
                activeModule: nextModule,
              }),
              auditLog: [
                makeAudit(
                  currentActorName(s),
                  'Switched Role Workspace',
                  `Active view switched to ${userRole} (${def.department})`,
                  userRole
                ),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        setActiveUserId: (nextUserId) =>
          set((s) => {
            if (nextUserId === s.activeUserId) return s;
            // Snapshot outgoing user's workspace state
            const savedMemories = patchUserMem(s, s.activeUserId, {
              activeProjectId: s.activeProjectId,
              activeModule: s.activeModule,
              preferredRole: s.userRole,
              unitSystem: s.unitSystem,
              theme: s.theme,
            });

            const usr = s.teamUsers.find((u) => u.id === nextUserId);
            const nextMem = savedMemories[nextUserId] || createEmptyUserMemory(nextUserId);
            const assigned = usr?.assignedRoles || [];
            const nextRole =
              nextMem.preferredRole && (assigned.length === 0 || assigned.includes(nextMem.preferredRole))
                ? nextMem.preferredRole
                : assigned[0] || s.userRole;
            const def = getRoleDefinition(nextRole, s.roleDefinitions);
            const desiredModule = nextMem.activeModule || 'dashboard';
            const nextModule = def.sidebarModules.includes(desiredModule) ? desiredModule : 'dashboard';

            const rememberedProj = s.projects.find((p) => p.id === nextMem.activeProjectId);
            const nextActiveProjectId =
              rememberedProj && canUserAccessProject(rememberedProj, nextUserId)
                ? rememberedProj.id
                : pickFallbackProjectId(s.projects, nextUserId);

            return {
              activeUserId: nextUserId,
              userRole: nextRole,
              activeModule: nextModule,
              unitSystem: nextMem.unitSystem || s.unitSystem,
              theme: nextMem.theme || s.theme,
              activeProjectId: nextActiveProjectId,
              userMemories: {
                ...savedMemories,
                [nextUserId]: {
                  ...nextMem,
                  activeProjectId: nextActiveProjectId,
                  preferredRole: nextRole,
                  activeModule: nextModule,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          }),

        setGlobalSearch: (globalSearch) => set({ globalSearch }),
        setActiveProject: (activeProjectId) =>
          set((s) => {
            const target = s.projects.find((p) => p.id === activeProjectId);
            if (!target || !canUserAccessProject(target, s.activeUserId)) return s;
            return {
              activeProjectId,
              userMemories: patchUserMem(s, s.activeUserId, { activeProjectId }),
            };
          }),

        updateUserMemory: (patch) =>
          set((s) => ({
            userMemories: patchUserMem(s, s.activeUserId, patch),
          })),

        clearUserMemory: (targetUserId) =>
          set((s) => {
            const uid = targetUserId || s.activeUserId;
            const fresh = createEmptyUserMemory(uid);
            return {
              userMemories: {
                ...s.userMemories,
                [uid]: {
                  ...fresh,
                  activeProjectId: uid === s.activeUserId ? s.activeProjectId : undefined,
                },
              },
              auditLog: [
                makeAudit(
                  currentActorName(s),
                  'Cleared Personal Workspace Memory',
                  `Reset personal mapping memory, templates & scratchpad for ${uid}`,
                  s.userRole
                ),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        addCustomRole: (role) =>
          set((s) => ({
            roleDefinitions: [
              ...s.roleDefinitions,
              { ...role, id: `role-${Date.now()}`, isCustom: true },
            ],
            auditLog: [
              makeAudit(currentActorName(s), 'Created Custom Role', `${role.name} (${role.department})`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateRoleDefinition: (roleId, patch) =>
          set((s) => ({
            roleDefinitions: s.roleDefinitions.map((r) =>
              r.id === roleId ? { ...r, ...patch } : r
            ),
            auditLog: [
              makeAudit(currentActorName(s), 'Updated Role Permissions', `Modified role ${roleId}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateTeamUser: (userId, patch) =>
          set((s) => ({
            teamUsers: s.teamUsers.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
          })),

        addTeamUser: (user) =>
          set((s) => ({
            teamUsers: [...s.teamUsers, { ...user, id: `usr-${Date.now()}` }],
          })),

        undo: () =>
          set((s) => {
            if (s.past.length === 0) return s;
            const prev = s.past[s.past.length - 1];
            const current: HistorySnapshot = {
              projects: JSON.parse(JSON.stringify(s.projects)),
              resources: JSON.parse(JSON.stringify(s.resources)),
            };
            return {
              projects: prev.projects,
              resources: prev.resources,
              past: s.past.slice(0, -1),
              future: [current, ...s.future.slice(0, 29)],
            };
          }),

        redo: () =>
          set((s) => {
            if (s.future.length === 0) return s;
            const next = s.future[0];
            const current: HistorySnapshot = {
              projects: JSON.parse(JSON.stringify(s.projects)),
              resources: JSON.parse(JSON.stringify(s.resources)),
            };
            return {
              projects: next.projects,
              resources: next.resources,
              past: [...s.past, current],
              future: s.future.slice(1),
            };
          }),

        updateActiveProject: (patch, logAction) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({ ...p, ...patch })),
            auditLog: logAction
              ? [makeAudit(s.companyProfile.preparedBy, logAction, patch.name || s.activeProjectId), ...s.auditLog.slice(0, 99)]
              : s.auditLog,
          })),

        createProjectFromTemplate: (templateId, customName, country, visibility) =>
          set((s) => {
            const tpl = PROJECT_TEMPLATES.find((t) => t.id === templateId) || PROJECT_TEMPLATES[0];
            const baseProj = tpl.buildProject(customName, country);
            const userMem = s.userMemories[s.activeUserId];
            const resolvedVisibility: ProjectVisibility =
              visibility || userMem?.defaultProjectVisibility || 'team';
            const actorName = currentActorName(s);
            const newProj: Project = {
              ...baseProj,
              visibility: resolvedVisibility,
              ownerUserId: s.activeUserId,
              ownerName: actorName,
              sharedWithUserIds: [],
            };
            return {
              ...pushHistory(s),
              projects: [newProj, ...s.projects],
              activeProjectId: newProj.id,
              userMemories: patchUserMem(s, s.activeUserId, { activeProjectId: newProj.id }),
              auditLog: [
                makeAudit(
                  actorName,
                  resolvedVisibility === 'private' ? 'Created Private Project' : 'Created Project',
                  `${newProj.name} (${newProj.country || 'Pakistan'}) [${resolvedVisibility}] from ${tpl.name}`,
                  s.userRole
                ),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        setProjectVisibility: (projectId, visibility, sharedWithUserIds) =>
          set((s) => {
            const actorName = currentActorName(s);
            return {
              ...pushHistory(s),
              projects: s.projects.map((p) => {
                if (p.id !== projectId) return p;
                return {
                  ...p,
                  visibility,
                  ownerUserId: p.ownerUserId || s.activeUserId,
                  ownerName: p.ownerName || actorName,
                  sharedWithUserIds:
                    sharedWithUserIds !== undefined
                      ? sharedWithUserIds
                      : visibility === 'team'
                      ? []
                      : p.sharedWithUserIds || [],
                  updatedAt: new Date().toISOString(),
                };
              }),
              auditLog: [
                makeAudit(
                  actorName,
                  'Updated Project Visibility',
                  `Project ${projectId} set to ${visibility === 'private' ? 'Private Workspace' : 'Shared Team'}`,
                  s.userRole
                ),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        duplicateActiveProject: () =>
          set((s) => {
            const cur = s.projects.find((p) => p.id === s.activeProjectId);
            if (!cur) return s;
            const actorName = currentActorName(s);
            const copy: Project = JSON.parse(JSON.stringify(cur));
            copy.id = `proj-${Date.now()}`;
            copy.name = `${cur.name} (Copy)`;
            copy.code = `${cur.code}-COPY`;
            copy.approvalStatus = 'Draft';
            copy.visibility =
              cur.visibility || s.userMemories[s.activeUserId]?.defaultProjectVisibility || 'team';
            copy.ownerUserId = s.activeUserId;
            copy.ownerName = actorName;
            copy.sharedWithUserIds = [];
            copy.updatedAt = new Date().toISOString();
            return {
              ...pushHistory(s),
              projects: [copy, ...s.projects],
              activeProjectId: copy.id,
              userMemories: patchUserMem(s, s.activeUserId, { activeProjectId: copy.id }),
              auditLog: [
                makeAudit(actorName, 'Duplicated Project', copy.name, s.userRole),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        deleteProject: (projectId) =>
          set((s) => {
            const visibleBefore = s.projects.filter((p) => canUserAccessProject(p, s.activeUserId));
            if (visibleBefore.length <= 1) return s;
            const remaining = s.projects.filter((p) => p.id !== projectId);
            const nextVisible = remaining.filter((p) => canUserAccessProject(p, s.activeUserId));
            if (nextVisible.length === 0) return s;
            const nextActiveId =
              s.activeProjectId === projectId ? nextVisible[0].id : s.activeProjectId;
            return {
              ...pushHistory(s),
              projects: remaining,
              activeProjectId: nextActiveId,
              userMemories: patchUserMem(s, s.activeUserId, { activeProjectId: nextActiveId }),
            };
          }),

        addMeasurement: (row) => {
          const newId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              measurements: [...p.measurements, { ...row, id: newId }],
            })),
          }));
          return newId;
        },

        updateMeasurement: (id, patch) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              measurements: p.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
            })),
          })),

        deleteMeasurement: (id) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              measurements: p.measurements.filter((m) => m.id !== id),
            })),
          })),

        bulkAddMeasurements: (rows) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              measurements: [
                ...p.measurements,
                ...rows.map((r, idx) => ({
                  ...r,
                  id: `m-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
                })),
              ],
            })),
            auditLog: [
              makeAudit(s.companyProfile.preparedBy, 'Bulk Measurement Import', `Added ${rows.length} rows`),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        addBOQItem: (item) => {
          const newId = `boq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              boqItems: [...p.boqItems, { ...item, id: newId }],
            })),
          }));
          return newId;
        },

        updateBOQItem: (id, patch) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              boqItems: p.boqItems.map((b) => (b.id === id ? { ...b, ...patch } : b)),
            })),
          })),

        deleteBOQItem: (id) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              boqItems: p.boqItems
                .filter((b) => b.id !== id)
                .map((b) => ({
                  ...b,
                  dependencies: b.dependencies.filter((d) => d.predecessorId !== id),
                })),
              measurements: p.measurements.filter((m) => m.boqItemId !== id),
              rateAnalyses: p.rateAnalyses.filter((r) => r.boqItemId !== id),
            })),
          })),

        duplicateBOQItem: (id) =>
          set((s) => {
            const curProj = s.projects.find((p) => p.id === s.activeProjectId);
            const target = curProj?.boqItems.find((b) => b.id === id);
            if (!curProj || !target) return s;
            const newId = `boq-${Date.now()}`;
            const clonedItem: BOQItem = {
              ...JSON.parse(JSON.stringify(target)),
              id: newId,
              itemNo: `${target.itemNo}-B`,
              description: `${target.description} (Copy)`,
            };
            const existingRA = curProj.rateAnalyses.find((r) => r.boqItemId === id);
            const clonedRA = existingRA
              ? { ...JSON.parse(JSON.stringify(existingRA)), id: `ra-${Date.now()}`, boqItemId: newId }
              : null;
            return {
              ...pushHistory(s),
              projects: mapActiveProject(s, (p) => ({
                ...p,
                boqItems: [...p.boqItems, clonedItem],
                rateAnalyses: clonedRA ? [...p.rateAnalyses, clonedRA] : p.rateAnalyses,
              })),
            };
          }),

        bulkUpdateBOQItems: (ids, patch) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              boqItems: p.boqItems.map((b) => (ids.includes(b.id) ? { ...b, ...patch } : b)),
            })),
          })),

        upsertRateAnalysis: (ra) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => {
              const exists = p.rateAnalyses.some((r) => r.boqItemId === ra.boqItemId);
              return {
                ...p,
                rateAnalyses: exists
                  ? p.rateAnalyses.map((r) => (r.boqItemId === ra.boqItemId ? ra : r))
                  : [...p.rateAnalyses, ra],
              };
            }),
          })),

        updateResourceRate: (id, patch) =>
          set((s) => ({
            ...pushHistory(s),
            resources: s.resources.map((r) =>
              r.id === id
                ? {
                    ...r,
                    ...patch,
                    lastUpdated: new Date().toISOString().slice(0, 10),
                    isOutdated: false,
                  }
                : r
            ),
            auditLog: [
              makeAudit(s.companyProfile.preparedBy, 'Rate Library Updated', `Updated resource ${id}`),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        addResourceRate: (res) =>
          set((s) => ({
            ...pushHistory(s),
            resources: [
              ...s.resources,
              {
                ...res,
                id: `res-${Date.now()}`,
                lastUpdated: new Date().toISOString().slice(0, 10),
                isOutdated: false,
              },
            ],
          })),

        importResourceRates: (list) =>
          set((s) => {
            const byCode = new Map<string, ResourceRate>();
            s.resources.forEach((r) => byCode.set(r.code.toLowerCase(), r));
            const next = [...s.resources];
            for (const item of list) {
              const existing = byCode.get(item.code.toLowerCase());
              if (existing) {
                const idx = next.findIndex((r) => r.id === existing.id);
                next[idx] = {
                  ...existing,
                  ...item,
                  lastUpdated: new Date().toISOString().slice(0, 10),
                  isOutdated: false,
                };
              } else {
                next.push({
                  ...item,
                  id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  lastUpdated: new Date().toISOString().slice(0, 10),
                  isOutdated: false,
                });
              }
            }
            return {
              ...pushHistory(s),
              resources: next,
              auditLog: [
                makeAudit(s.companyProfile.preparedBy, 'Rate Schedule Import', `Imported ${list.length} resource rates`),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        addDrawing: (drawing) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawings: [...p.drawings, drawing],
            })),
            auditLog: [
              makeAudit(s.companyProfile.preparedBy, 'Drawing Uploaded', drawing.name),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        deleteDrawing: (drawingId) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawings: p.drawings.filter((d) => d.id !== drawingId),
            })),
          })),

        setDrawingCalibration: (drawingId, calibration) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawings: p.drawings.map((d) =>
                d.id === drawingId
                  ? {
                      ...d,
                      calibrations: { ...d.calibrations, [calibration.page]: calibration },
                    }
                  : d
              ),
            })),
          })),

        addDrawingMarkup: (drawingId, markup) => {
          const mkId = `mk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawings: p.drawings.map((d) =>
                d.id === drawingId
                  ? { ...d, markups: [...d.markups, { ...markup, id: mkId }] }
                  : d
              ),
            })),
          }));
          return mkId;
        },

        deleteDrawingMarkup: (drawingId, markupId) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawings: p.drawings.map((d) =>
                d.id === drawingId
                  ? { ...d, markups: d.markups.filter((m) => m.id !== markupId) }
                  : d
              ),
              measurements: p.measurements.filter((m) => m.sourceMarkupId !== markupId),
            })),
          })),

        // Project Planner Actions
        addWBSNode: (node) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              wbsNodes: [...(p.wbsNodes || []), { ...node, id: `wbs-${Date.now()}` }],
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Added WBS Node', `${node.code} ${node.name}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        deleteWBSNode: (nodeId) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              wbsNodes: (p.wbsNodes || []).filter((n) => n.id !== nodeId && n.parentId !== nodeId),
            })),
          })),

        addScheduleScenario: (scenario) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              scheduleScenarios: [
                ...(p.scheduleScenarios || []),
                {
                  ...scenario,
                  id: `scn-${Date.now()}`,
                  createdAt: new Date().toISOString().slice(0, 10),
                },
              ],
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Created Schedule Scenario', scenario.name, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        deleteScheduleScenario: (scenarioId) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              scheduleScenarios: (p.scheduleScenarios || []).filter((sc) => sc.id !== scenarioId || sc.isBaseline),
            })),
          })),

        addDelayRisk: (risk) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              risksAndDelays: [{ ...risk, id: `risk-${Date.now()}` }, ...(p.risksAndDelays || [])],
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Logged Delay / Risk', risk.title, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateDelayRisk: (riskId, patch) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              risksAndDelays: (p.risksAndDelays || []).map((r) =>
                r.id === riskId ? { ...r, ...patch } : r
              ),
            })),
          })),

        deleteDelayRisk: (riskId) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              risksAndDelays: (p.risksAndDelays || []).filter((r) => r.id !== riskId),
            })),
          })),

        levelScheduleResources: (maxCapacity = 16) =>
          set((s) => {
            const raw = s.projects.find((p) => p.id === s.activeProjectId);
            if (!raw) return s;
            const summary = computeProjectSummary(hydrateProjectOperationalData(raw), s.resources);
            const nonCriticalWithFloat = summary.tasks.filter(
              (t) => !t.isCritical && t.totalFloat >= 2 && !t.isMilestone
            );
            if (nonCriticalWithFloat.length === 0) return s;
            const shiftMap = new Map<string, number>();
            nonCriticalWithFloat.forEach((t, idx) => {
              const shift = Math.min(t.totalFloat, (idx % 3) + 2);
              shiftMap.set(t.boqItemId, (raw.boqItems.find((b) => b.id === t.boqItemId)?.startOffsetDays || 0) + shift);
            });
            return {
              ...pushHistory(s),
              projects: mapActiveProject(s, (p) => ({
                ...p,
                boqItems: p.boqItems.map((b) =>
                  shiftMap.has(b.id) ? { ...b, startOffsetDays: shiftMap.get(b.id) } : b
                ),
              })),
              auditLog: [
                makeAudit(
                  currentActorName(s),
                  'Resource Leveling Applied',
                  `Shifted ${shiftMap.size} non-critical activities within float (target <= ${maxCapacity} workers/day)`,
                  s.userRole
                ),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        // Departmental Operations
        addDrawingRegisterItem: (item) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              drawingRegister: [{ ...item, id: `dreg-${Date.now()}` }, ...(p.drawingRegister || [])],
              notifications: pushNotification(p, {
                title: `New Drawing Issued: ${item.drawingNo} (${item.currentRev})`,
                message: `${item.title} uploaded as ${item.status} by ${item.draftsman}. Estimator & Planner notified for quantity/schedule impact.`,
                targetRoles: ['Estimator/QS', 'Project Planner', 'Project Manager', 'Site Engineer'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'pipeline',
                priority: 'High',
              }),
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Drawing Register Entry', `${item.drawingNo} ${item.currentRev}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateDrawingRegisterItem: (id, patch) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => {
              const existing = (p.drawingRegister || []).find((d) => d.id === id);
              return {
                ...p,
                drawingRegister: (p.drawingRegister || []).map((d) =>
                  d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : d
                ),
                notifications:
                  (patch.status === 'IFC' || Boolean(patch.currentRev)) && existing
                    ? pushNotification(p, {
                        title: patch.currentRev
                          ? `New Drawing Revision Issued: ${existing.drawingNo} (${patch.currentRev})`
                          : `IFC Drawing Released: ${existing.drawingNo}`,
                        message: `${existing.title} (${patch.currentRev || existing.currentRev}) issued for Drawing-to-Estimate diff check & CPM schedule review.`,
                        targetRoles: ['Estimator/QS', 'Project Planner', 'Site Engineer', 'Project Manager'],
                        fromUser: currentActorName(s),
                        fromRole: s.userRole,
                        module: patch.currentRev ? 'pipeline' : 'takeoff',
                        priority: 'High',
                      })
                    : p.notifications,
              };
            }),
            auditLog: [
              makeAudit(currentActorName(s), 'Updated Drawing Status', `${id} -> ${patch.status || patch.currentRev || 'Updated'}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        fulfillDrawingRequest: (reqId) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => {
              const req = (p.drawingRequests || []).find((r) => r.id === reqId);
              return {
                ...p,
                drawingRequests: (p.drawingRequests || []).map((r) =>
                  r.id === reqId ? { ...r, status: 'Issued' } : r
                ),
                notifications: req
                  ? pushNotification(p, {
                      title: `Drawing Request Issued: ${req.title}`,
                      message: `Draftsman fulfilled request from ${req.requestedBy}. Ready for takeoff/site use.`,
                      targetRoles: [req.requestedRole, 'Estimator/QS', 'Project Manager'],
                      fromUser: currentActorName(s),
                      fromRole: s.userRole,
                      module: 'takeoff',
                      priority: 'Normal',
                    })
                  : p.notifications,
              };
            }),
            auditLog: [
              makeAudit(currentActorName(s), 'Fulfilled Drawing Request', reqId, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        addTeamTask: (task) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              teamTasks: [{ ...task, id: `tsk-${Date.now()}` }, ...(p.teamTasks || [])],
              notifications: pushNotification(p, {
                title: `Task Assigned: ${task.title}`,
                message: `Assigned to ${task.assignedTo} (${task.assigneeRole}) · Due ${task.dueDate}`,
                targetRoles: [task.assigneeRole, 'Project Manager'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'collaboration',
                priority: task.priority === 'Critical' ? 'Urgent' : task.priority === 'High' ? 'High' : 'Normal',
              }),
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Assigned Task', `${task.title} -> ${task.assignedTo}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateTeamTask: (taskId, patch) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              teamTasks: (p.teamTasks || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
            })),
          })),

        deleteTeamTask: (taskId) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              teamTasks: (p.teamTasks || []).filter((t) => t.id !== taskId),
            })),
          })),

        addAttendanceRecord: (rec) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              manpowerAttendance: [{ ...rec, id: `att-${Date.now()}` }, ...(p.manpowerAttendance || [])],
            })),
          })),

        submitDailySiteReport: (rep, autoSync = true) =>
          set((s) => {
            const newId = `dsr-${Date.now()}`;
            return {
              ...pushHistory(s),
              projects: mapActiveProject(s, (p) => {
                const summary = computeProjectSummary(p, s.resources);
                const boqComputed = summary.items.find((i) => i.id === rep.boqItemId);
                const totalQty = boqComputed?.quantity || 0;
                const deltaPct = totalQty > 0 ? (rep.qtyExecuted / totalQty) * 100 : 10;
                return {
                  ...p,
                  dailySiteReports: [
                    {
                      ...rep,
                      id: newId,
                      syncedToSchedule: autoSync,
                      status: autoSync ? 'Verified & Synced' : 'Pending Verification',
                    },
                    ...(p.dailySiteReports || []),
                  ],
                  boqItems: autoSync
                    ? p.boqItems.map((b) =>
                        b.id === rep.boqItemId
                          ? { ...b, actualProgressPct: Math.min(100, Math.round(b.actualProgressPct + deltaPct)) }
                          : b
                      )
                    : p.boqItems,
                  notifications: pushNotification(p, {
                    title: `Site Report Logged: ${rep.qtyExecuted} ${rep.unit}`,
                    message: `${rep.workDescription} (${autoSync ? 'Auto-synced to CPM Schedule' : 'Pending verification'})`,
                    targetRoles: ['Project Planner', 'Project Manager', 'Team Leader'],
                    fromUser: currentActorName(s),
                    fromRole: s.userRole,
                    module: 'planner',
                    priority: 'Normal',
                  }),
                };
              }),
              auditLog: [
                makeAudit(currentActorName(s), 'Daily Site Report Submitted', `${rep.workDescription} (${rep.qtyExecuted} ${rep.unit})`, s.userRole),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        verifyAndSyncDailyReport: (repId) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => {
              const rep = (p.dailySiteReports || []).find((r) => r.id === repId);
              if (!rep || rep.syncedToSchedule) return p;
              const summary = computeProjectSummary(p, s.resources);
              const boqComputed = summary.items.find((i) => i.id === rep.boqItemId);
              const totalQty = boqComputed?.quantity || 0;
              const deltaPct = totalQty > 0 ? (rep.qtyExecuted / totalQty) * 100 : 10;
              return {
                ...p,
                dailySiteReports: (p.dailySiteReports || []).map((r) =>
                  r.id === repId ? { ...r, syncedToSchedule: true, status: 'Verified & Synced' } : r
                ),
                boqItems: p.boqItems.map((b) =>
                  b.id === rep.boqItemId
                    ? { ...b, actualProgressPct: Math.min(100, Math.round(b.actualProgressPct + deltaPct)) }
                    : b
                ),
              };
            }),
            auditLog: [
              makeAudit(currentActorName(s), 'Synced Site Progress to Schedule', `Daily report ${repId} applied to CPM & EVM`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        toggleQAChecklist: (qaId, result) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              qaChecklists: (p.qaChecklists || []).map((q) =>
                q.id === qaId ? { ...q, result, date: new Date().toISOString().slice(0, 10) } : q
              ),
            })),
          })),

        addQAChecklist: (qa) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              qaChecklists: [{ ...qa, id: `qa-${Date.now()}` }, ...(p.qaChecklists || [])],
            })),
          })),

        addRABill: (bill) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              raBills: [...(p.raBills || []), { ...bill, id: `ra-bill-${Date.now()}` }],
              notifications: pushNotification(p, {
                title: `New Running Bill ${bill.billNo} Submitted`,
                message: `Net payable ${bill.netPayable.toLocaleString()} submitted for Finance certification.`,
                targetRoles: ['Finance/Accounts', 'Project Manager'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'dashboard',
                priority: 'High',
              }),
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Submitted RA Bill', bill.billNo, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateRABillStatus: (billId, status) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              raBills: (p.raBills || []).map((b) =>
                b.id === billId ? { ...b, status, certifiedBy: currentActorName(s) } : b
              ),
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'RA Bill Status Updated', `${billId} -> ${status}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateVendorInvoiceStatus: (invId, status) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              vendorInvoices: (p.vendorInvoices || []).map((v) =>
                v.id === invId ? { ...v, status } : v
              ),
            })),
          })),

        addPurchaseRequisition: (pr) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              purchaseRequisitions: [{ ...pr, id: `pr-${Date.now()}` }, ...(p.purchaseRequisitions || [])],
              notifications: pushNotification(p, {
                title: `New Purchase Requisition ${pr.prNo}`,
                message: `${pr.qty} ${pr.unit} of ${pr.materialName} requested for ${pr.requiredDate}.`,
                targetRoles: ['Procurement', 'Project Manager'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'dashboard',
                priority: 'Normal',
              }),
            })),
            auditLog: [
              makeAudit(currentActorName(s), 'Created Purchase Requisition', `${pr.prNo}: ${pr.materialName}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        selectVendorQuoteAndIssuePO: (prId, vendorName) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => {
              const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(110 + Math.random() * 880)}`;
              return {
                ...p,
                purchaseRequisitions: (p.purchaseRequisitions || []).map((pr) =>
                  pr.id === prId
                    ? {
                        ...pr,
                        selectedVendor: vendorName,
                        poNumber,
                        status: 'PO Issued',
                        deliveryStatus: 'Ordered',
                      }
                    : pr
                ),
                notifications: pushNotification(p, {
                  title: `Purchase Order ${poNumber} Issued`,
                  message: `Awarded to ${vendorName}. Track inbound site delivery.`,
                  targetRoles: ['Site Engineer', 'Finance/Accounts', 'Project Manager'],
                  fromUser: currentActorName(s),
                  fromRole: s.userRole,
                  module: 'dashboard',
                  priority: 'Normal',
                }),
              };
            }),
            auditLog: [
              makeAudit(currentActorName(s), 'Issued Purchase Order', `Awarded PR ${prId} to ${vendorName}`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateDeliveryStatus: (prId, deliveryStatus) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              purchaseRequisitions: (p.purchaseRequisitions || []).map((pr) =>
                pr.id === prId
                  ? {
                      ...pr,
                      deliveryStatus,
                      status: deliveryStatus === 'Delivered' ? 'Delivered' : pr.status,
                    }
                  : pr
              ),
            })),
          })),

        advanceWorkflowStage: (stageId, nextStatus, note) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => {
              const stages = [...(p.workflowHandoffs || [])];
              const idx = stages.findIndex((st) => st.id === stageId);
              if (idx === -1) return p;
              const cur = stages[idx];
              stages[idx] = {
                ...cur,
                status: nextStatus,
                handoffNote: note || cur.handoffNote,
                ownerName: currentActorName(s),
                updatedAt: new Date().toISOString(),
              };

              let nextTasks = [...(p.teamTasks || [])];
              let nextNotifs = p.notifications || [];
              const nextStage = stages[idx + 1];

              if ((nextStatus === 'Submitted' || nextStatus === 'Approved') && nextStage) {
                stages[idx + 1] = {
                  ...nextStage,
                  status: nextStage.status === 'Pending' ? 'In Progress' : nextStage.status,
                  updatedAt: new Date().toISOString(),
                };
                nextTasks = [
                  {
                    id: `tsk-wf-${Date.now()}`,
                    title: `Handoff Action: ${nextStage.stageName}`,
                    description: note || `Handed off from ${cur.role}: ${cur.stageName}`,
                    status: 'Backlog',
                    priority: 'High',
                    assignedTo: nextStage.ownerName,
                    assigneeRole: nextStage.role,
                    department: nextStage.department,
                    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                    sourceHandoffStageId: nextStage.id,
                  },
                  ...nextTasks,
                ];
                nextNotifs = pushNotification(p, {
                  title: `Department Handoff -> ${nextStage.role}`,
                  message: `${cur.role} completed "${cur.stageName}" (${nextStatus}). Next action assigned to ${nextStage.role}.`,
                  targetRoles: [nextStage.role, 'Project Manager', 'Admin'],
                  fromUser: currentActorName(s),
                  fromRole: s.userRole,
                  module: nextStage.targetModule,
                  priority: 'High',
                });
              }

              return {
                ...p,
                workflowHandoffs: stages,
                teamTasks: nextTasks,
                notifications: nextNotifs,
              };
            }),
            auditLog: [
              makeAudit(
                currentActorName(s),
                `Workflow Stage ${nextStatus}`,
                `${stageId}: ${note}`,
                s.userRole
              ),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        updateProjectApprovalStatus: (approvalStatus, note) =>
          set((s) => ({
            ...pushHistory(s),
            projects: mapActiveProject(s, (p) => ({
              ...p,
              approvalStatus,
              notifications: pushNotification(p, {
                title: `Estimate Status: ${approvalStatus}`,
                message: note || `Project estimate status changed to ${approvalStatus} by ${s.userRole}.`,
                targetRoles: ['Project Manager', 'Estimator/QS', 'Finance/Accounts', 'Client/Viewer', 'Admin'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'collaboration',
                priority: approvalStatus === 'Rejected' ? 'Urgent' : 'High',
              }),
            })),
            auditLog: [
              makeAudit(
                currentActorName(s),
                `Estimate ${approvalStatus}`,
                note || `Status set to ${approvalStatus}`,
                s.userRole
              ),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        markNotificationRead: (notifId) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              notifications: (p.notifications || []).map((n) =>
                n.id === notifId && !n.readByRoles.includes(s.userRole)
                  ? { ...n, readByRoles: [...n.readByRoles, s.userRole] }
                  : n
              ),
            })),
          })),

        markAllNotificationsRead: () =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              notifications: (p.notifications || []).map((n) =>
                !n.readByRoles.includes(s.userRole)
                  ? { ...n, readByRoles: [...n.readByRoles, s.userRole] }
                  : n
              ),
            })),
          })),

        createRevision: (versionLabel, notes) =>
          set((s) => {
            const proj = s.projects.find((p) => p.id === s.activeProjectId);
            if (!proj) return s;
            const summary = computeProjectSummary(proj, s.resources);
            const rev: EstimateRevision = {
              id: `rev-${Date.now()}`,
              versionLabel,
              createdAt: new Date().toISOString(),
              createdBy: currentActorName(s),
              notes,
              grandTotal: summary.grandTotal,
              directCost: summary.directCost,
              itemsSnapshot: summary.items.map((i) => ({
                itemNo: i.itemNo,
                category: i.category,
                description: i.description,
                unit: i.unit,
                quantity: i.quantity,
                rate: i.unitRate,
                amount: i.amount,
              })),
            };
            return {
              projects: mapActiveProject(s, (p) => ({
                ...p,
                revisions: [...p.revisions, rev],
              })),
              auditLog: [
                makeAudit(currentActorName(s), 'Saved Estimate Revision', versionLabel, s.userRole),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        addComment: (text, targetSection) =>
          set((s) => {
            const actor = currentActorName(s);
            const mentionedRoles = s.roleDefinitions
              .map((r) => r.name)
              .filter((roleName) => text.toLowerCase().includes(`@${roleName.toLowerCase()}`));
            const comment: ProjectComment = {
              id: `cmt-${Date.now()}`,
              author: actor,
              role: s.userRole,
              timestamp: new Date().toISOString(),
              text,
              targetSection,
              mentions: mentionedRoles,
            };
            return {
              projects: mapActiveProject(s, (p) => ({
                ...p,
                comments: [comment, ...p.comments],
                notifications:
                  mentionedRoles.length > 0
                    ? pushNotification(p, {
                        title: `Mentioned in ${targetSection}`,
                        message: `${actor} (${s.userRole}): "${text}"`,
                        targetRoles: mentionedRoles,
                        fromUser: actor,
                        fromRole: s.userRole,
                        module: 'collaboration',
                        priority: 'Normal',
                      })
                    : p.notifications,
              })),
              auditLog: [
                makeAudit(actor, 'Posted Review Comment', `${targetSection}: ${text.slice(0, 80)}`, s.userRole),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        updateCompanyProfile: (patch) =>
          set((s) => ({
            companyProfile: { ...s.companyProfile, ...patch },
          })),

        commitPipelineToEstimate: ({
          revisionLabel,
          drawingType,
          elements,
          newDrawings = [],
          rememberMappings = true,
          auditEntries = [],
        }) => {
          const state = get();
          const rawProject = state.projects.find((p) => p.id === state.activeProjectId);
          if (!rawProject) {
            return {
              runId: '',
              grandTotalBefore: 0,
              grandTotalAfter: 0,
              durationBefore: 0,
              durationAfter: 0,
            };
          }

          const hydrated = hydrateProjectOperationalData(rawProject);
          const beforeSummary = computeProjectSummary(hydrated, state.resources);

          const approvedEls = elements.filter(
            (el) => el.status === 'Accepted' || el.status === 'Edited'
          );

          const runId = `run-${Date.now()}`;
          const newRows: MeasurementRow[] = [];
          let srCounter = hydrated.measurements.length + 1;

          for (const el of approvedEls) {
            if (!el.linkedBoqItemId) continue;
            const boq = hydrated.boqItems.find((b) => b.id === el.linkedBoqItemId);
            if (!boq) continue;

            newRows.push({
              id: `m-pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              boqItemId: boq.id,
              srNo: String(srCounter++),
              description: `${el.elementName} (${revisionLabel})`,
              no: el.no || 1,
              length: el.length || 0,
              breadth: el.breadth || 0,
              height: el.height || 0,
              formula: el.formula,
              unit: boq.unit,
              remarks: `${el.sheetName} P.${el.page} · ${el.coordinatesLabel}`,
              sourceDrawingId: el.sheetId,
              sourceDrawingName: el.sheetName,
              sourcePage: el.page,
              sourceCoords: {
                page: el.page,
                xPct: el.bbox.xPct,
                yPct: el.bbox.yPct,
                wPct: el.bbox.wPct,
                hPct: el.bbox.hPct,
              },
              pipelineRunId: runId,
            });

            if (el.deductionQty > 0) {
              newRows.push({
                id: `m-pipe-ded-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                boqItemId: boq.id,
                srNo: String(srCounter++),
                description: `DEDUCTION: Openings in ${el.elementName} (${revisionLabel})`,
                no: 1,
                length: el.deductionQty,
                breadth: 1,
                height: 0,
                isDeduction: true,
                unit: boq.unit,
                remarks: `Auto-deducted from ${el.sheetName} P.${el.page}`,
                sourceDrawingId: el.sheetId,
                sourceDrawingName: el.sheetName,
                sourcePage: el.page,
                sourceCoords: {
                  page: el.page,
                  xPct: el.bbox.xPct,
                  yPct: el.bbox.yPct,
                  wPct: el.bbox.wPct,
                  hPct: el.bbox.hPct,
                },
                pipelineRunId: runId,
              });
            }
          }

          // Merge learned mapping memory
          let updatedMemory: PipelineMappingMemory[] = [...(hydrated.pipelineMappingMemory || [])];
          if (rememberMappings) {
            for (const el of approvedEls) {
              if (!el.linkedBoqItemId) continue;
              const pattern = el.elementName.toLowerCase().trim();
              const existingIdx = updatedMemory.findIndex(
                (m) => m.pattern === pattern || m.elementType === el.elementType
              );
              const memEntry: PipelineMappingMemory = {
                pattern,
                elementType: el.elementType,
                boqItemId: el.linkedBoqItemId,
                category: el.category,
                updatedAt: new Date().toISOString().slice(0, 10),
              };
              if (existingIdx >= 0) {
                updatedMemory[existingIdx] = memEntry;
              } else {
                updatedMemory = [memEntry, ...updatedMemory].slice(0, 60);
              }
            }
          }

          const existingDrawIds = new Set(hydrated.drawings.map((d) => d.id));
          const mergedDrawings = [
            ...hydrated.drawings,
            ...newDrawings.filter((nd) => !existingDrawIds.has(nd.id)),
          ];

          const nextProjectSnapshot: Project = {
            ...hydrated,
            drawings: mergedDrawings,
            measurements: [...hydrated.measurements, ...newRows],
            pipelineMappingMemory: updatedMemory,
          };
          const afterSummary = computeProjectSummary(nextProjectSnapshot, state.resources);

          const summaryByKey: DrawingPipelineRun['summaryByKey'] = {};
          for (const el of approvedEls) {
            const k = el.elementName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            summaryByKey[k] = {
              label: el.elementName,
              netQty: (summaryByKey[k]?.netQty || 0) + el.netQty,
              unit: el.unit,
              boqItemId: el.linkedBoqItemId,
            };
          }

          const pipelineRun: DrawingPipelineRun = {
            id: runId,
            revisionLabel,
            drawingType,
            sheetNames: Array.from(new Set(elements.map((e) => e.sheetName))),
            createdAt: new Date().toISOString(),
            createdBy: currentActorName(state),
            grandTotalBefore: beforeSummary.grandTotal,
            grandTotalAfter: afterSummary.grandTotal,
            durationBefore: beforeSummary.totalDurationWorkingDays,
            durationAfter: afterSummary.totalDurationWorkingDays,
            elements,
            summaryByKey,
          };

          const extraAudits = auditEntries
            .slice(0, 20)
            .map((a) => makeAudit(currentActorName(state), a.action, a.details, state.userRole));

          set((s) => {
            const existingUserMem =
              s.userMemories[s.activeUserId]?.pipelineMappingMemory || [];
            let mergedUserMem = [...existingUserMem];
            if (rememberMappings) {
              for (const memEntry of updatedMemory) {
                const idx = mergedUserMem.findIndex(
                  (m) => m.pattern === memEntry.pattern || m.elementType === memEntry.elementType
                );
                if (idx >= 0) mergedUserMem[idx] = memEntry;
                else mergedUserMem = [memEntry, ...mergedUserMem].slice(0, 80);
              }
            }
            return {
              ...pushHistory(s),
              projects: mapActiveProject(s, (p) => ({
                ...p,
                drawings: mergedDrawings,
                measurements: [...p.measurements, ...newRows],
                pipelineMappingMemory: updatedMemory,
                pipelineRuns: [pipelineRun, ...(p.pipelineRuns || [])].slice(0, 20),
                notifications: pushNotification(p, {
                  title: `Drawing Pipeline Committed (${revisionLabel})`,
                  message: `${newRows.length} quantity rows pushed from ${pipelineRun.sheetNames.join(', ')}. Cost Δ ${(afterSummary.grandTotal - beforeSummary.grandTotal).toFixed(0)} ${p.currency}.`,
                  targetRoles: ['Estimator/QS', 'Project Planner', 'Project Manager'],
                  fromUser: currentActorName(s),
                  fromRole: s.userRole,
                  module: 'abstract-cost',
                  priority: 'High',
                }),
              })),
              userMemories: patchUserMem(s, s.activeUserId, {
                pipelineMappingMemory: mergedUserMem,
              }),
              auditLog: [
                makeAudit(
                  currentActorName(state),
                  'Committed Drawing-to-Estimate Pipeline',
                  `${revisionLabel} (${drawingType}): ${newRows.length} rows -> Grand Total ${afterSummary.grandTotal.toFixed(0)}`,
                  state.userRole
                ),
                ...extraAudits,
                ...state.auditLog,
              ].slice(0, 120),
            };
          });

          return {
            runId,
            grandTotalBefore: beforeSummary.grandTotal,
            grandTotalAfter: afterSummary.grandTotal,
            durationBefore: beforeSummary.totalDurationWorkingDays,
            durationAfter: afterSummary.totalDurationWorkingDays,
          };
        },

        savePipelineTemplate: (template) =>
          set((s) => {
            const createdTpl: PipelineTemplate = { ...template, id: `ptpl-${Date.now()}` };
            const existingUserTpls = s.userMemories[s.activeUserId]?.pipelineTemplates || [];
            return {
              projects: mapActiveProject(s, (p) => ({
                ...p,
                pipelineTemplates: [
                  createdTpl,
                  ...(p.pipelineTemplates || []).filter((t) => t.name !== template.name),
                ],
              })),
              userMemories: patchUserMem(s, s.activeUserId, {
                pipelineTemplates: [
                  createdTpl,
                  ...existingUserTpls.filter((t) => t.name !== template.name),
                ],
              }),
              auditLog: [
                makeAudit(currentActorName(s), 'Saved Extraction Template', `${template.name} (${template.drawingType})`, s.userRole),
                ...s.auditLog.slice(0, 99),
              ],
            };
          }),

        deletePipelineTemplate: (templateId) =>
          set((s) => {
            const existingUserTpls = s.userMemories[s.activeUserId]?.pipelineTemplates || [];
            return {
              projects: mapActiveProject(s, (p) => ({
                ...p,
                pipelineTemplates: (p.pipelineTemplates || []).filter((t) => t.id !== templateId),
              })),
              userMemories: patchUserMem(s, s.activeUserId, {
                pipelineTemplates: existingUserTpls.filter((t) => t.id !== templateId),
              }),
            };
          }),

        notifyDraftsmanRevisionUpload: (sheetNames, revisionLabel) =>
          set((s) => ({
            projects: mapActiveProject(s, (p) => ({
              ...p,
              notifications: pushNotification(p, {
                title: `New Drawing Revision Uploaded (${revisionLabel})`,
                message: `${currentActorName(s)} (${s.userRole}) uploaded ${sheetNames.join(', ')} into Drawing-to-Estimate. Ready for takeoff & schedule impact check.`,
                targetRoles: ['Estimator/QS', 'Project Planner', 'Project Manager'],
                fromUser: currentActorName(s),
                fromRole: s.userRole,
                module: 'pipeline',
                priority: 'High',
              }),
            })),
            auditLog: [
              makeAudit(
                currentActorName(s),
                'Uploaded Drawing Revision',
                `${revisionLabel}: ${sheetNames.join(', ')} (notified Estimator & Planner)`,
                s.userRole
              ),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        restoreBackup: (payload) =>
          set((s) => ({
            ...pushHistory(s),
            projects: payload.projects.length ? payload.projects : s.projects,
            resources: payload.resources.length ? payload.resources : s.resources,
            activeProjectId: payload.projects[0]?.id || s.activeProjectId,
            companyProfile: payload.companyProfile || s.companyProfile,
            auditLog: [
              makeAudit(currentActorName(s), 'Restored Backup', `Loaded ${payload.projects.length} project(s)`, s.userRole),
              ...s.auditLog.slice(0, 99),
            ],
          })),

        resetDemoData: () =>
          set({
            projects: [{ ...SAMPLE_HOUSE_PROJECT, visibility: 'team' }],
            activeProjectId: SAMPLE_HOUSE_PROJECT.id,
            userMemories: {
              'usr-1': {
                userId: 'usr-1',
                activeProjectId: SAMPLE_HOUSE_PROJECT.id,
                activeModule: 'dashboard',
                preferredRole: 'Admin',
                unitSystem: 'imperial',
                theme: 'light',
                defaultProjectVisibility: 'team',
                personalNotes: '',
                pipelineMappingMemory: [],
                pipelineTemplates: [],
                updatedAt: new Date().toISOString(),
              },
            },
            resources: DEFAULT_RESOURCES,
            companyProfile: DEFAULT_COMPANY,
            roleDefinitions: DEFAULT_ROLE_DEFINITIONS,
            teamUsers: DEFAULT_TEAM_USERS,
            past: [],
            future: [],
            auditLog: [
              makeAudit('System', 'Reset Demo Data', 'Restored Oakridge 2-Storey Villa & Multi-Role Workflow', 'Admin'),
            ],
          }),
      };
    },
    {
      name: 'civil-estimate-pro-v2',
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        const st = (persistedState || {}) as Partial<EstimateState>;
        if (version < 3 && Array.isArray(st.roleDefinitions)) {
          st.roleDefinitions = st.roleDefinitions.map((role) => {
            if (role.name === 'Client/Viewer') return role;
            const nextSidebar = [...role.sidebarModules];
            if (!nextSidebar.includes('unit-converter')) nextSidebar.push('unit-converter');
            const pipelineRoles = [
              'Admin',
              'Project Manager',
              'Project Planner',
              'Estimator/QS',
              'Draftsman/CAD Technician',
              'Site Engineer',
            ];
            if (pipelineRoles.includes(role.name) && !nextSidebar.includes('pipeline')) {
              nextSidebar.push('pipeline');
            }
            return {
              ...role,
              sidebarModules: nextSidebar,
              permissions: {
                ...role.permissions,
                'unit-converter': role.permissions?.['unit-converter'] || ['view', 'export'],
                ...(pipelineRoles.includes(role.name)
                  ? {
                      pipeline:
                        role.permissions?.pipeline ||
                        (role.name === 'Estimator/QS'
                          ? ['view', 'create', 'edit', 'approve', 'export']
                          : ['view', 'create', 'edit']),
                    }
                  : {}),
              },
            };
          });
        }
        if (version < 4) {
          if (Array.isArray(st.teamUsers)) {
            st.teamUsers = st.teamUsers.map((u) =>
              u.id === 'usr-1'
                ? {
                    ...u,
                    name: 'Zaim Farooq',
                    title: 'Administrator & Principal',
                    avatarUrl: '/assets/aistudio/Muzammil_Farooq_8a04ff1a.jpg',
                  }
                : u
            );
          }
          if (st.companyProfile && st.companyProfile.approvedBy === 'Tariq Mahmood, PE') {
            st.companyProfile = {
              ...st.companyProfile,
              approvedBy: 'Zaim Farooq',
            };
          }
        }
        if (version < 5) {
          if (Array.isArray(st.projects)) {
            st.projects = st.projects.map((p) => ({
              ...p,
              visibility: p.visibility || 'team',
            }));
          }
          if (!st.userMemories) {
            const uid = st.activeUserId || 'usr-1';
            st.userMemories = {
              [uid]: {
                userId: uid,
                activeProjectId: st.activeProjectId || SAMPLE_HOUSE_PROJECT.id,
                activeModule: st.activeModule || 'dashboard',
                preferredRole: st.userRole || 'Admin',
                unitSystem: st.unitSystem || 'imperial',
                theme: st.theme || 'light',
                defaultProjectVisibility: 'team',
                personalNotes: '',
                pipelineMappingMemory: [],
                pipelineTemplates: [],
                updatedAt: new Date().toISOString(),
              },
            };
          }
        }
        if (version < 6 && Array.isArray(st.roleDefinitions)) {
          const defaultMap = new Map(DEFAULT_ROLE_DEFINITIONS.map((r) => [r.name, r]));
          st.roleDefinitions = st.roleDefinitions.map((role) => {
            if (role.isCustom) return role;
            const def = defaultMap.get(role.name);
            if (!def) return role;
            return {
              ...role,
              sidebarModules: def.sidebarModules,
              permissions: def.permissions,
            };
          });
          if (st.userRole && st.activeModule) {
            const activeDef = getRoleDefinition(st.userRole, st.roleDefinitions);
            if (!activeDef.sidebarModules.includes(st.activeModule)) {
              st.activeModule = 'dashboard';
            }
          }
        }
        return st as EstimateState;
      },
      partialize: (state) => ({
        theme: state.theme,
        unitSystem: state.unitSystem,
        userRole: state.userRole,
        activeUserId: state.activeUserId,
        roleDefinitions: state.roleDefinitions,
        teamUsers: state.teamUsers,
        activeProjectId: state.activeProjectId,
        projects: state.projects,
        userMemories: state.userMemories,
        resources: state.resources,
        companyProfile: state.companyProfile,
        auditLog: state.auditLog,
      }),
    }
  )
);
