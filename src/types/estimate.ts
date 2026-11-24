export type WorkCategory =
  | 'Earthwork'
  | 'PCC'
  | 'RCC'
  | 'Masonry'
  | 'Plaster'
  | 'Flooring'
  | 'Painting'
  | 'Doors & Windows'
  | 'Roofing'
  | 'Plumbing'
  | 'Electrical'
  | 'Roads'
  | 'Pipes'
  | 'Miscellaneous';

export const WORK_CATEGORIES: WorkCategory[] = [
  'Earthwork',
  'PCC',
  'RCC',
  'Masonry',
  'Plaster',
  'Flooring',
  'Painting',
  'Doors & Windows',
  'Roofing',
  'Plumbing',
  'Electrical',
  'Roads',
  'Pipes',
  'Miscellaneous',
];

export type CurrencyCode = 'USD' | 'INR' | 'PKR' | 'EUR' | 'GBP' | 'AED';
export type CountryCode = 'Pakistan' | 'India' | 'UAE' | 'USA' | 'UK' | 'EU';
export type UnitSystem = 'metric' | 'imperial';
export type RateScheduleType =
  | 'MRS-Market'
  | 'MRS-Punjab'
  | 'NHA-CSR'
  | 'MES-Schedule'
  | 'SOR-2026'
  | 'CPWD-DSR'
  | 'PWD-SSR'
  | 'DM-Rates'
  | 'RSMeans-2026'
  | 'BCIS-UK'
  | 'DIN-276'
  | 'Custom'
  | (string & {});

export type ProjectType = string;

export type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Revision Requested';

export type BuiltInRole =
  | 'Admin'
  | 'Project Manager'
  | 'Project Planner'
  | 'Estimator/QS'
  | 'Team Leader'
  | 'Draftsman/CAD Technician'
  | 'Site Engineer'
  | 'Finance/Accounts'
  | 'Procurement'
  | 'Client/Viewer';

export type UserRole = BuiltInRole | (string & {});

export type PermissionAction = 'view' | 'create' | 'edit' | 'approve' | 'export' | 'delete';

export type NavModule =
  | 'dashboard'
  | 'planner'
  | 'collaboration'
  | 'setup'
  | 'takeoff'
  | 'measurements'
  | 'rate-analysis'
  | 'abstract-quantities'
  | 'abstract-cost'
  | 'materials'
  | 'labor-equipment'
  | 'timeline'
  | 'pipeline'
  | 'unit-converter'
  | 'reports'
  | 'settings';

export interface RoleDefinition {
  id: string;
  name: UserRole;
  department: string;
  shortLabel: string;
  colorHex: string;
  description: string;
  approvalLimit: number; // 0 = no financial approval, -1 = unlimited
  isCustom?: boolean;
  sidebarModules: NavModule[];
  permissions: Partial<Record<NavModule, PermissionAction[]>>;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  team: string;
  assignedRoles: UserRole[];
  avatarUrl?: string;
}

export interface ResourceRate {
  id: string;
  type: 'material' | 'labor' | 'equipment';
  code: string;
  name: string;
  unit: string;
  rate: number;
  tradeOrGroup: string;
  lastUpdated: string;
  isOutdated?: boolean;
}

export interface RateAnalysisResourceLine {
  resourceId: string;
  quantity: number;
  remarks?: string;
}

export interface RateAnalysis {
  id: string;
  boqItemId: string;
  baseQty: number;
  outputUnit: string;
  materials: RateAnalysisResourceLine[];
  labor: RateAnalysisResourceLine[];
  equipment: RateAnalysisResourceLine[];
  wastagePct: number;
  locationFactor: number;
  escalationPct: number;
  notes?: string;
}

export interface MeasurementRow {
  id: string;
  boqItemId: string;
  srNo: string;
  description: string;
  no: number;
  length: number;
  breadth: number;
  height: number;
  formula?: string;
  isDeduction?: boolean;
  unit: string;
  remarks: string;
  sourceDrawingId?: string;
  sourceDrawingName?: string;
  sourcePage?: number;
  sourceMarkupId?: string;
  sourceCoords?: {
    page: number;
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
  };
  pipelineRunId?: string;
  rebarDiaMm?: number;
}

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export type ScheduleConstraintType = 'ASAP' | 'SNET' | 'FNLT';

export interface ActivityDependency {
  predecessorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface BOQItem {
  id: string;
  itemNo: string;
  category: WorkCategory;
  description: string;
  unit: string;
  useRateAnalysis: boolean;
  manualRate: number;
  productivityPerDay: number;
  crewSize: number;
  manualDurationDays?: number;
  startOffsetDays?: number;
  constraintType?: ScheduleConstraintType;
  constraintDay?: number;
  assignedTeamLeader?: string;
  wbsNodeId?: string;
  assignedResourceIds?: string[];
  dependencies: ActivityDependency[];
  baselineStartDay?: number;
  baselineDurationDays?: number;
  actualProgressPct: number;
  isMilestone?: boolean;
  remarks?: string;
}

export type MarkupTool = 'select' | 'calibrate' | 'length' | 'area' | 'perimeter' | 'count' | 'polyline' | 'volume';

export interface Point2D {
  x: number;
  y: number;
}

export interface DrawingMarkup {
  id: string;
  page: number;
  tool: Exclude<MarkupTool, 'select' | 'calibrate'>;
  label: string;
  layer: 'Architectural' | 'Structural' | 'MEP' | 'Takeoff';
  points: Point2D[];
  depth?: number;
  pixelValue: number;
  realValue: number;
  unit: string;
  color: string;
  boqItemId?: string;
  measurementRowId?: string;
}

export interface ScaleCalibration {
  page: number;
  pixelsPerUnit: number; // pixels per 1 meter (or 1 ft if imperial)
  unit: 'm' | 'ft';
  referenceDistance: number;
  p1: Point2D;
  p2: Point2D;
}

export interface DrawingFile {
  id: string;
  name: string;
  fileType: 'image' | 'pdf' | 'dxf';
  dataUrl: string;
  dxfEntities?: DxfEntity[];
  pageCount: number;
  calibrations: Record<number, ScaleCalibration>;
  markups: DrawingMarkup[];
  uploadedAt: string;
}

export interface DxfEntity {
  type: 'LINE' | 'LWPOLYLINE' | 'CIRCLE' | 'TEXT';
  layer: string;
  points?: Point2D[];
  center?: Point2D;
  radius?: number;
  text?: string;
}

export interface EstimateRevision {
  id: string;
  versionLabel: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  grandTotal: number;
  directCost: number;
  itemsSnapshot: Array<{
    itemNo: string;
    category: WorkCategory;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export interface ProjectComment {
  id: string;
  author: string;
  role: UserRole;
  timestamp: string;
  text: string;
  targetSection: string;
  mentions?: string[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  userRole?: UserRole;
  action: string;
  details: string;
}

export interface CalendarSettings {
  workingDaysPerWeek: 5 | 6 | 7;
  holidays: string[];
  weatherBufferDays: number;
}

export interface WBSNode {
  id: string;
  code: string;
  name: string;
  level: 'Project' | 'Phase' | 'Work Package';
  parentId?: string;
  boqItemIds: string[];
  ownerRole?: UserRole;
}

export interface ScheduleScenario {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  crewMultiplier: number;
  productivityMultiplier: number;
  startShiftDays: number;
  extraBufferDays: number;
  isBaseline?: boolean;
}

export interface DelayRiskItem {
  id: string;
  title: string;
  category: 'Schedule' | 'Cost' | 'Technical' | 'Supply Chain' | 'Weather';
  impactDays: number;
  costImpact: number;
  probability: 'Low' | 'Medium' | 'High';
  owner: string;
  ownerRole: UserRole;
  mitigation: string;
  status: 'Open' | 'Mitigated' | 'Closed';
  linkedBoqItemId?: string;
}

export interface DrawingRevisionEntry {
  rev: string;
  date: string;
  by: string;
  notes: string;
  status: 'Draft' | 'Under Review' | 'Approved' | 'IFC';
}

export interface DrawingRegisterItem {
  id: string;
  drawingNo: string;
  title: string;
  discipline: 'Architectural' | 'Structural' | 'MEP' | 'Civil';
  currentRev: string;
  status: 'Draft' | 'Under Review' | 'Approved' | 'IFC';
  draftsman: string;
  transmittalNo: string;
  updatedAt: string;
  linkedDrawingFileId?: string;
  reviewComments: string;
  revisions: DrawingRevisionEntry[];
}

export interface DrawingRequestItem {
  id: string;
  requestedBy: string;
  requestedRole: UserRole;
  title: string;
  discipline: 'Architectural' | 'Structural' | 'MEP' | 'Civil';
  priority: 'Medium' | 'High' | 'Urgent';
  dueDate: string;
  status: 'Pending' | 'In Progress' | 'Issued';
}

export interface TeamTaskItem {
  id: string;
  title: string;
  description: string;
  status: 'Backlog' | 'In Progress' | 'Blocked' | 'Completed';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignedTo: string;
  assigneeRole: UserRole;
  department: string;
  dueDate: string;
  boqItemId?: string;
  dailyTargetQty?: number;
  executedTodayQty?: number;
  unit?: string;
  sourceHandoffStageId?: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  teamName: string;
  foreman: string;
  trade: string;
  plannedWorkers: number;
  presentWorkers: number;
  remarks: string;
}

export interface DailySiteReport {
  id: string;
  date: string;
  submittedBy: string;
  submitterRole: UserRole;
  boqItemId: string;
  workDescription: string;
  qtyExecuted: number;
  unit: string;
  materialConsumed: string;
  weather: 'Clear' | 'Partly Cloudy' | 'Rain Delay' | 'High Wind';
  photoCaption: string;
  siteObservations?: string;
  voiceDurationSec?: number;
  voiceTranscriptionSource?: 'gemini' | 'browser';
  syncedToSchedule: boolean;
  status: 'Pending Verification' | 'Verified & Synced';
}

export interface QAChecklistItem {
  id: string;
  title: string;
  boqItemId?: string;
  inspector: string;
  date: string;
  result: 'Pass' | 'Hold' | 'Pending';
  remarks: string;
}

export interface RABill {
  id: string;
  billNo: string;
  periodLabel: string;
  submittedDate: string;
  grossAmount: number;
  retentionPct: number;
  retentionHeld: number;
  taxDeducted: number;
  netPayable: number;
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Paid';
  certifiedBy?: string;
}

export interface VendorInvoice {
  id: string;
  invoiceNo: string;
  vendorName: string;
  category: string;
  amount: number;
  dueDate: string;
  status: 'Pending' | 'Approved' | 'Paid';
}

export interface VendorQuote {
  id: string;
  vendorName: string;
  unitPrice: number;
  leadTimeDays: number;
  paymentTerms: string;
}

export interface PurchaseRequisition {
  id: string;
  prNo: string;
  materialName: string;
  resourceId?: string;
  qty: number;
  unit: string;
  requiredDate: string;
  requestedBy: string;
  status: 'Draft' | 'Pending Quotes' | 'PO Issued' | 'Delivered';
  quotes: VendorQuote[];
  selectedVendor?: string;
  poNumber?: string;
  deliveryStatus?: 'Ordered' | 'In Transit' | 'Partial' | 'Delivered';
}

export interface WorkflowStage {
  id: string;
  order: number;
  stageName: string;
  role: UserRole;
  department: string;
  status: 'Pending' | 'In Progress' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected';
  ownerName: string;
  updatedAt: string;
  handoffNote: string;
  targetModule: NavModule;
}

export interface RoleNotification {
  id: string;
  title: string;
  message: string;
  targetRoles: UserRole[];
  fromUser: string;
  fromRole: UserRole;
  createdAt: string;
  module: NavModule;
  priority: 'Normal' | 'High' | 'Urgent';
  readByRoles: UserRole[];
}

export type ProjectVisibility = 'team' | 'private';

export interface UserWorkspaceMemory {
  userId: string;
  activeProjectId?: string;
  activeModule?: NavModule;
  preferredRole?: UserRole;
  unitSystem?: UnitSystem;
  theme?: 'light' | 'dark';
  defaultProjectVisibility?: ProjectVisibility;
  personalNotes?: string;
  pipelineMappingMemory: PipelineMappingMemory[];
  pipelineTemplates: PipelineTemplate[];
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  client: string;
  country?: CountryCode;
  location: string;
  type: ProjectType;
  startDate: string;
  builtUpArea: number; // in m2 (or ft2 when imperial)
  floors: number;
  currency: CurrencyCode;
  rateSchedule: RateScheduleType;
  taxPct: number;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  escalationPct: number;
  approvalStatus: ApprovalStatus;
  visibility?: ProjectVisibility;
  ownerUserId?: string;
  ownerName?: string;
  sharedWithUserIds?: string[];
  calendar: CalendarSettings;
  boqItems: BOQItem[];
  measurements: MeasurementRow[];
  rateAnalyses: RateAnalysis[];
  drawings: DrawingFile[];
  revisions: EstimateRevision[];
  comments: ProjectComment[];
  updatedAt: string;
  // Multi-role, planner & departmental collaboration data
  statusDay?: number;
  wbsNodes?: WBSNode[];
  scheduleScenarios?: ScheduleScenario[];
  risksAndDelays?: DelayRiskItem[];
  drawingRegister?: DrawingRegisterItem[];
  drawingRequests?: DrawingRequestItem[];
  teamTasks?: TeamTaskItem[];
  manpowerAttendance?: AttendanceRecord[];
  dailySiteReports?: DailySiteReport[];
  qaChecklists?: QAChecklistItem[];
  raBills?: RABill[];
  vendorInvoices?: VendorInvoice[];
  purchaseRequisitions?: PurchaseRequisition[];
  workflowHandoffs?: WorkflowStage[];
  notifications?: RoleNotification[];
  pipelineRuns?: DrawingPipelineRun[];
  pipelineMappingMemory?: PipelineMappingMemory[];
  pipelineTemplates?: PipelineTemplate[];
}

export type DrawingType =
  | 'Architectural Plan'
  | 'Structural'
  | 'Foundation'
  | 'Road'
  | 'Drainage'
  | 'Site Plan'
  | 'MEP';

export type PipelineConfidenceLevel = 'High' | 'Medium' | 'Low';
export type PipelineElementStatus = 'Pending' | 'Accepted' | 'Edited' | 'Rejected' | 'Flagged';

export interface PipelineBBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface PipelineExtractedElement {
  id: string;
  sheetId: string;
  sheetName: string;
  page: number;
  elementName: string;
  elementType: string;
  category: WorkCategory;
  no: number;
  length: number;
  breadth: number;
  height: number;
  deductionQty: number;
  grossQty: number;
  netQty: number;
  unit: string;
  formula: string;
  confidenceScore: number;
  confidenceLevel: PipelineConfidenceLevel;
  bbox: PipelineBBox;
  coordinatesLabel: string;
  status: PipelineElementStatus;
  linkedBoqItemId?: string;
  layer: string;
  notes: string;
}

export interface PipelineScheduleRow {
  tag: string;
  kind: 'Door' | 'Window' | 'Column' | 'Footing' | 'Beam' | 'Slab' | 'Rebar';
  scheduleCount: number;
  dimensionsLabel: string;
  sheetName: string;
}

export interface PipelineValidationWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  title: string;
  description: string;
  elementId?: string;
}

export interface PipelineMappingMemory {
  pattern: string;
  elementType: string;
  boqItemId: string;
  category: WorkCategory;
  updatedAt: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  drawingType: DrawingType;
  defaultScaleRatio: string;
  defaultWallHeightM: number;
  defaultSlabThicknessM: number;
  steelRatioKgPerM3: number;
  autoAcceptMinConfidence: number;
  categoryMappings: Partial<Record<string, string>>;
}

export interface DrawingPipelineRun {
  id: string;
  revisionLabel: string;
  drawingType: DrawingType;
  sheetNames: string[];
  createdAt: string;
  createdBy: string;
  grandTotalBefore: number;
  grandTotalAfter: number;
  durationBefore: number;
  durationAfter: number;
  elements: PipelineExtractedElement[];
  summaryByKey: Record<string, { label: string; netQty: number; unit: string; boqItemId?: string }>;
}

export interface CompanyProfile {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  licenseNo: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
}

export interface ComputedBOQItem extends BOQItem {
  quantity: number;
  measurementCount: number;
  unitRate: number;
  materialUnitCost: number;
  laborUnitCost: number;
  equipmentUnitCost: number;
  wastageFactor: number;
  amount: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  rateAnalysis?: RateAnalysis;
}

export interface CPMTask {
  boqItemId: string;
  itemNo: string;
  category: WorkCategory;
  name: string;
  quantity: number;
  unit: string;
  productivityPerDay: number;
  crewSize: number;
  durationDays: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
  baselineStartDay: number;
  baselineDurationDays: number;
  actualProgressPct: number;
  isMilestone: boolean;
  cost: number;
  laborManDays: number;
  dependencies: ActivityDependency[];
  constraintType?: ScheduleConstraintType;
  constraintDay?: number;
  assignedTeamLeader?: string;
  wbsNodeId?: string;
  assignedResourceIds?: string[];
}

export interface CashFlowPeriod {
  monthIndex: number;
  label: string;
  plannedMonthlyCost: number;
  plannedCumulativeCost: number;
  earnedCumulativeCost: number;
  actualCumulativeCost: number;
  peakManpower: number;
  avgManpower: number;
}

export interface EVMStats {
  statusDay: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  vac: number;
  forecastWorkingDays: number;
  overallProgressPct: number;
}

export interface MaterialSummaryRow {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  totalQty: number;
  unitRate: number;
  totalCost: number;
  categoryGroup: string;
}

export interface LaborSummaryRow {
  resourceId: string;
  name: string;
  trade: string;
  unit: string;
  totalManDays: number;
  dailyRate: number;
  totalCost: number;
}

export interface EquipmentSummaryRow {
  resourceId: string;
  name: string;
  unit: string;
  totalHours: number;
  hourlyRate: number;
  totalCost: number;
}

export interface SystemAlert {
  id: string;
  severity: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  module: NavModule;
}

export interface ComputedProjectSummary {
  items: ComputedBOQItem[];
  categoryTotals: Record<WorkCategory, { quantityItems: number; directCost: number; sharePct: number }>;
  directCost: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  overheadAmount: number;
  profitAmount: number;
  taxAmount: number;
  contingencyAmount: number;
  escalationAmount: number;
  grandTotal: number;
  grandTotalInWords: string;
  costPerAreaUnit: number;
  totalLaborManDays: number;
  totalEquipmentHours: number;
  totalDurationWorkingDays: number;
  totalDurationCalendarDays: number;
  tasks: CPMTask[];
  cashFlow: CashFlowPeriod[];
  manpowerHistogram: Array<{ dayLabel: string; day: number; workers: number; capacity: number; overAllocated: boolean }>;
  evm: EVMStats;
  overAllocatedBuckets: number;
  materialSchedule: MaterialSummaryRow[];
  laborSchedule: LaborSummaryRow[];
  equipmentSchedule: EquipmentSummaryRow[];
  alerts: SystemAlert[];
}
