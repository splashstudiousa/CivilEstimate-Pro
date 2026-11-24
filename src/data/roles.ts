import { NavModule, PermissionAction, RoleDefinition, TeamUser, UserRole } from '../types/estimate';

const ALL_MODULES: NavModule[] = [
  'dashboard',
  'setup',
  'takeoff',
  'measurements',
  'rate-analysis',
  'abstract-quantities',
  'abstract-cost',
  'materials',
  'labor-equipment',
  'planner',
  'timeline',
  'collaboration',
  'pipeline',
  'unit-converter',
  'reports',
  'settings',
];

const FULL_PERMS: PermissionAction[] = ['view', 'create', 'edit', 'approve', 'export', 'delete'];

export function normalizeRoleName(role?: string): UserRole {
  if (!role) return 'Admin';
  if (role === 'Estimator') return 'Estimator/QS';
  if (role === 'Reviewer') return 'Project Manager';
  if (role === 'Viewer') return 'Client/Viewer';
  return role;
}

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'role-admin',
    name: 'Admin',
    department: 'Executive & IT Governance',
    shortLabel: 'ADMIN',
    colorHex: '#0F2137',
    description: 'Full platform governance, role/permission management, rate libraries & financial overrides.',
    approvalLimit: -1,
    sidebarModules: ALL_MODULES,
    permissions: Object.fromEntries(ALL_MODULES.map((m) => [m, FULL_PERMS])),
  },
  {
    id: 'role-pm',
    name: 'Project Manager',
    department: 'Project Delivery',
    shortLabel: 'PM',
    colorHex: '#EA580C',
    description: 'Overall project health, budget vs actual, milestones, approvals, team workload & risk governance.',
    approvalLimit: 25000000,
    sidebarModules: [
      'dashboard',
      'setup',
      'planner',
      'timeline',
      'abstract-cost',
      'collaboration',
      'reports',
    ],
    permissions: {
      dashboard: ['view', 'approve', 'export'],
      setup: ['view', 'edit', 'approve'],
      planner: ['view', 'create', 'edit', 'approve', 'export'],
      timeline: ['view', 'edit', 'approve', 'export'],
      'abstract-cost': ['view', 'approve', 'export'],
      collaboration: ['view', 'create', 'edit', 'approve'],
      reports: ['view', 'export'],
    },
  },
  {
    id: 'role-planner',
    name: 'Project Planner',
    department: 'Planning & Controls',
    shortLabel: 'PLAN',
    colorHex: '#0284C7',
    description: 'WBS, CPM master schedule, resource leveling, EVM (SPI/CPI), look-ahead plans & what-if scenarios.',
    approvalLimit: 0,
    sidebarModules: [
      'dashboard',
      'planner',
      'timeline',
      'labor-equipment',
      'collaboration',
      'reports',
    ],
    permissions: {
      dashboard: ['view', 'export'],
      planner: ['view', 'create', 'edit', 'export', 'delete'],
      timeline: ['view', 'create', 'edit', 'export'],
      'labor-equipment': ['view', 'edit', 'export'],
      collaboration: ['view', 'create', 'edit'],
      reports: ['view', 'export'],
    },
  },
  {
    id: 'role-estimator',
    name: 'Estimator/QS',
    department: 'Cost & Quantity Surveying',
    shortLabel: 'QS',
    colorHex: '#0D9488',
    description: 'Drawing takeoff, measurement sheets, rate analysis, BOQ abstracts & estimate revisions.',
    approvalLimit: 0,
    sidebarModules: [
      'dashboard',
      'takeoff',
      'pipeline',
      'measurements',
      'rate-analysis',
      'abstract-quantities',
      'abstract-cost',
      'unit-converter',
      'collaboration',
      'reports',
    ],
    permissions: {
      dashboard: ['view', 'export'],
      takeoff: ['view', 'create', 'edit', 'delete'],
      pipeline: ['view', 'create', 'edit', 'approve', 'export'],
      measurements: ['view', 'create', 'edit', 'delete', 'export'],
      'rate-analysis': ['view', 'create', 'edit', 'export'],
      'abstract-quantities': ['view', 'export'],
      'abstract-cost': ['view', 'create', 'edit', 'export'],
      'unit-converter': ['view', 'export'],
      collaboration: ['view', 'create', 'edit'],
      reports: ['view', 'export'],
    },
  },
  {
    id: 'role-team-leader',
    name: 'Team Leader',
    department: 'Site Execution Crews',
    shortLabel: 'TL',
    colorHex: '#D97706',
    description: 'Kanban crew task board, daily targets, trade attendance, field issues & crew productivity.',
    approvalLimit: 0,
    sidebarModules: ['dashboard', 'labor-equipment', 'collaboration'],
    permissions: {
      dashboard: ['view', 'create', 'edit'],
      'labor-equipment': ['view', 'edit'],
      collaboration: ['view', 'create', 'edit'],
    },
  },
  {
    id: 'role-draftsman',
    name: 'Draftsman/CAD Technician',
    department: 'Design & CAD Studio',
    shortLabel: 'CAD',
    colorHex: '#4F46E5',
    description: 'Drawing register, revision control (Rev A/B/C), IFC status, transmittals & takeoff support.',
    approvalLimit: 0,
    sidebarModules: ['dashboard', 'takeoff', 'pipeline', 'collaboration'],
    permissions: {
      dashboard: ['view', 'create', 'edit'],
      takeoff: ['view', 'create', 'edit', 'delete'],
      pipeline: ['view', 'create', 'edit'],
      collaboration: ['view', 'create', 'edit'],
    },
  },
  {
    id: 'role-site-engineer',
    name: 'Site Engineer',
    department: 'Field Construction',
    shortLabel: 'SITE',
    colorHex: '#16A34A',
    description: 'Daily progress reports (auto-synced to schedule), executed quantities, QA/QC & site logs.',
    approvalLimit: 500000,
    sidebarModules: [
      'dashboard',
      'measurements',
      'unit-converter',
      'collaboration',
    ],
    permissions: {
      dashboard: ['view', 'create', 'edit'],
      measurements: ['view', 'create', 'edit'],
      'unit-converter': ['view', 'export'],
      collaboration: ['view', 'create', 'edit'],
    },
  },
  {
    id: 'role-finance',
    name: 'Finance/Accounts',
    department: 'Finance & Commercial',
    shortLabel: 'FIN',
    colorHex: '#7C3AED',
    description: 'Estimate vs budget, RA bills, payment certificates, cash flow, vendor invoices, retention & tax.',
    approvalLimit: 15000000,
    sidebarModules: [
      'dashboard',
      'abstract-cost',
      'collaboration',
      'reports',
    ],
    permissions: {
      dashboard: ['view', 'approve', 'export'],
      'abstract-cost': ['view', 'approve', 'export'],
      collaboration: ['view', 'create', 'edit', 'approve'],
      reports: ['view', 'export'],
    },
  },
  {
    id: 'role-procurement',
    name: 'Procurement',
    department: 'Supply Chain & Purchasing',
    shortLabel: 'PROC',
    colorHex: '#0E7490',
    description: 'Material schedules, purchase requisitions, vendor quotes comparison, PO issuance & deliveries.',
    approvalLimit: 5000000,
    sidebarModules: ['dashboard', 'materials', 'collaboration', 'reports'],
    permissions: {
      dashboard: ['view', 'create', 'edit', 'approve'],
      materials: ['view', 'create', 'edit', 'export'],
      collaboration: ['view', 'create', 'edit'],
      reports: ['view', 'export'],
    },
  },
  {
    id: 'role-client',
    name: 'Client/Viewer',
    department: 'Client / Owner Representative',
    shortLabel: 'CLIENT',
    colorHex: '#475569',
    description: 'Read-only executive progress summary, project milestones, approved budget & reports.',
    approvalLimit: 0,
    sidebarModules: ['dashboard', 'timeline', 'reports'],
    permissions: {
      dashboard: ['view'],
      timeline: ['view'],
      reports: ['view', 'export'],
    },
  },
];

export const DEFAULT_TEAM_USERS: TeamUser[] = [
  {
    id: 'usr-1',
    name: 'Zaim Farooq',
    email: 'splashstudio.usa@gmail.com',
    title: 'Administrator & Principal',
    department: 'Executive & Engineering',
    team: 'HQ Core Team',
    assignedRoles: DEFAULT_ROLE_DEFINITIONS.map((r) => r.name),
    avatarUrl: '/assets/aistudio/Muzammil_Farooq_8a04ff1a.jpg',
  },
  {
    id: 'usr-2',
    name: 'Eleanor Vance, PE',
    email: 'eleanor@aecsolutions.pro',
    title: 'Lead Quantity Surveyor',
    department: 'Cost & Quantity Surveying',
    team: 'Estimating Unit A',
    assignedRoles: ['Estimator/QS', 'Project Planner'],
    avatarUrl: '/src/assets/images/engineer_avatar_1795496551893.jpg',
  },
  {
    id: 'usr-3',
    name: 'Marcus Sterling, PMP',
    email: 'marcus@aecsolutions.pro',
    title: 'Senior Project Manager',
    department: 'Project Delivery',
    team: 'Residential Villas Division',
    assignedRoles: ['Project Manager', 'Admin'],
  },
  {
    id: 'usr-4',
    name: 'Bilal Tariq',
    email: 'bilal.site@aecsolutions.pro',
    title: 'Resident Site Engineer',
    department: 'Field Construction',
    team: 'DHA Phase 6 Crew',
    assignedRoles: ['Site Engineer', 'Team Leader'],
  },
  {
    id: 'usr-5',
    name: 'Sana Qureshi',
    email: 'sana.cad@aecsolutions.pro',
    title: 'Senior Architectural Draftsman',
    department: 'Design & CAD Studio',
    team: 'CAD Drafting Cell',
    assignedRoles: ['Draftsman/CAD Technician'],
  },
  {
    id: 'usr-6',
    name: 'Kamran Malik',
    email: 'kamran.fin@aecsolutions.pro',
    title: 'Commercial & Accounts Controller',
    department: 'Finance & Commercial',
    team: 'Accounts & Billing',
    assignedRoles: ['Finance/Accounts', 'Procurement'],
  },
];

export function getRoleDefinition(
  roleName: UserRole,
  roleDefs: RoleDefinition[] = DEFAULT_ROLE_DEFINITIONS
): RoleDefinition {
  const normalized = normalizeRoleName(roleName);
  return (
    roleDefs.find((r) => r.name === normalized) ||
    roleDefs[0] ||
    DEFAULT_ROLE_DEFINITIONS[0]
  );
}

export function hasModulePermission(
  roleName: UserRole,
  module: NavModule,
  action: PermissionAction,
  roleDefs: RoleDefinition[] = DEFAULT_ROLE_DEFINITIONS
): boolean {
  const def = getRoleDefinition(roleName, roleDefs);
  if (def.name === 'Admin') return true;
  const perms = def.permissions[module] || [];
  return perms.includes(action);
}
