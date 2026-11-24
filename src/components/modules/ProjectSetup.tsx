import React, { useState } from 'react';
import { CheckCircle2, Copy, Globe2, MessageSquare, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  ApprovalStatus,
  CountryCode,
  CurrencyCode,
  RateScheduleType,
} from '../../types/estimate';
import {
  COUNTRY_CATALOG,
  COUNTRY_LIST,
  getAllProjectTypesForCountry,
  getCountryProfile,
} from '../../data/countryCatalog';
import { PROJECT_TEMPLATES } from '../../data/templates';
import { convertArea, formatCurrency, getAreaLabel } from '../../engine/formatters';
import { RoleBadge } from '../common/RoleBadge';

const CURRENCIES: CurrencyCode[] = ['PKR', 'USD', 'INR', 'EUR', 'GBP', 'AED'];
const APPROVAL_STATES: ApprovalStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Approved',
  'Revision Requested',
  'Rejected',
];

export const ProjectSetup: React.FC = () => {
  const { project, summary, unitSystem } = useActiveProject();
  const projects = useEstimateStore((s) => s.projects);
  const updateActiveProject = useEstimateStore((s) => s.updateActiveProject);
  const setUnitSystem = useEstimateStore((s) => s.setUnitSystem);
  const createProjectFromTemplate = useEstimateStore((s) => s.createProjectFromTemplate);
  const duplicateActiveProject = useEstimateStore((s) => s.duplicateActiveProject);
  const deleteProject = useEstimateStore((s) => s.deleteProject);
  const addComment = useEstimateStore((s) => s.addComment);

  const activeCountry: CountryCode = project.country || 'Pakistan';
  const countryProfile = getCountryProfile(activeCountry);
  const countryTypes = getAllProjectTypesForCountry(activeCountry);
  const isCustomType = !countryTypes.includes(project.type);

  const [newComment, setNewComment] = useState('');
  const [commentSection, setCommentSection] = useState('General');
  const [newProjName, setNewProjName] = useState('');
  const [templateCountry, setTemplateCountry] = useState<CountryCode>(activeCountry);
  const [selectedTemplate, setSelectedTemplate] = useState(PROJECT_TEMPLATES[0].id);
  const [customTypeMode, setCustomTypeMode] = useState(false);

  const handleCountryChange = (nextCountry: CountryCode) => {
    const nextProfile = getCountryProfile(nextCountry);
    const nextTypes = getAllProjectTypesForCountry(nextCountry);
    const patch: Partial<typeof project> = { country: nextCountry };
    if (!nextTypes.includes(project.type)) {
      patch.type = nextTypes[0];
      setCustomTypeMode(false);
    }
    if (!nextProfile.rateSchedules.includes(project.rateSchedule)) {
      patch.rateSchedule = nextProfile.defaultRateSchedule;
    }
    updateActiveProject(patch, `Changed Country to ${nextCountry}`);
  };

  const applyCountryDefaults = () => {
    updateActiveProject(
      {
        currency: countryProfile.defaultCurrency,
        rateSchedule: countryProfile.defaultRateSchedule,
      },
      `Applied ${countryProfile.label} currency & rate schedule defaults`
    );
    setUnitSystem(countryProfile.defaultUnitSystem);
  };

  const needsDefaultSync =
    project.currency !== countryProfile.defaultCurrency ||
    unitSystem !== countryProfile.defaultUnitSystem ||
    project.rateSchedule !== countryProfile.defaultRateSchedule;

  const rateScheduleOptions: RateScheduleType[] = countryProfile.rateSchedules.includes(
    project.rateSchedule
  )
    ? countryProfile.rateSchedules
    : [project.rateSchedule, ...countryProfile.rateSchedules];

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addComment(newComment.trim(), commentSection);
    setNewComment('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Project Setup & Financial Parameters
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure project metadata, markups, approval status, and launch new estimates from templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={duplicateActiveProject}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate Project</span>
          </button>
          {projects.length > 1 && (
            <button
              type="button"
              onClick={() => deleteProject(project.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-red-200 dark:border-red-900/50 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Active Project Parameters */}
        <div className="xl:col-span-8 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              General Project Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => updateActiveProject({ name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Project Code / Reference
                </label>
                <input
                  type="text"
                  value={project.code}
                  onChange={(e) => updateActiveProject({ code: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Client / Authority
                </label>
                <input
                  type="text"
                  value={project.client}
                  onChange={(e) => updateActiveProject({ client: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Country / Engineering Region
                </label>
                <div className="relative">
                  <select
                    value={activeCountry}
                    onChange={(e) => handleCountryChange(e.target.value as CountryCode)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {COUNTRY_LIST.map((c) => (
                      <option key={c} value={c}>
                        {COUNTRY_CATALOG[c].label}
                      </option>
                    ))}
                  </select>
                </div>
                {needsDefaultSync && (
                  <button
                    type="button"
                    onClick={applyCountryDefaults}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>
                      Sync {countryProfile.defaultCurrency},{' '}
                      {countryProfile.defaultUnitSystem === 'imperial' ? 'FPS (ft)' : 'SI (m)'} &{' '}
                      {countryProfile.defaultRateSchedule}
                    </span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Site Location
                </label>
                <input
                  type="text"
                  value={project.location}
                  onChange={(e) => updateActiveProject({ location: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Project Type ({activeCountry} Standard Classifications)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomTypeMode((v) => !v)}
                    className="text-[11px] font-medium text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
                  >
                    {customTypeMode ? 'Choose from Country List' : 'Enter Custom Type'}
                  </button>
                </div>

                {customTypeMode ? (
                  <input
                    type="text"
                    value={project.type}
                    onChange={(e) => updateActiveProject({ type: e.target.value })}
                    placeholder="Enter custom civil project classification..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  />
                ) : (
                  <select
                    value={project.type}
                    onChange={(e) => updateActiveProject({ type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {isCustomType && (
                      <optgroup label="Current / Custom">
                        <option value={project.type}>{project.type}</option>
                      </optgroup>
                    )}
                    {countryProfile.projectTypeGroups.map((grp) => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.types.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={project.startDate}
                  onChange={(e) => updateActiveProject({ startDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Built-Up Area ({getAreaLabel(unitSystem)})
                </label>
                <input
                  type="number"
                  min={1}
                  value={Math.round(convertArea(project.builtUpArea, unitSystem))}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 0);
                    const m2 = unitSystem === 'imperial' ? val / 10.76391 : val;
                    updateActiveProject({ builtUpArea: m2 });
                  }}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Currency
                </label>
                <select
                  value={project.currency}
                  onChange={(e) => updateActiveProject({ currency: e.target.value as CurrencyCode })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Rate Schedule Basis
                </label>
                <select
                  value={project.rateSchedule}
                  onChange={(e) =>
                    updateActiveProject({ rateSchedule: e.target.value as RateScheduleType })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                >
                  {rateScheduleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Financial Markups & Contingency */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Indirect Costs, Taxes & Markups
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Changes recalculate Abstract of Cost, Cash Flow & KPIs immediately.
                </p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Current Grand Total</div>
                <div className="text-base font-mono font-bold text-orange-600 dark:text-orange-400">
                  {formatCurrency(summary.grandTotal, project.currency)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { key: 'overheadPct', label: 'Overhead %', val: project.overheadPct },
                { key: 'profitPct', label: 'Profit %', val: project.profitPct },
                { key: 'taxPct', label: 'Tax / GST %', val: project.taxPct },
                { key: 'contingencyPct', label: 'Contingency %', val: project.contingencyPct },
                { key: 'escalationPct', label: 'Escalation %', val: project.escalationPct },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={50}
                    value={field.val}
                    onChange={(e) =>
                      updateActiveProject({
                        [field.key]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Approval Workflow & Review Comments */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Approval Workflow & Engineering Review Notes
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Status:</span>
                <select
                  value={project.approvalStatus}
                  onChange={(e) =>
                    updateActiveProject(
                      { approvalStatus: e.target.value as ApprovalStatus },
                      'Updated Approval Status'
                    )
                  }
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  {APPROVAL_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <form onSubmit={handleAddComment} className="flex flex-col sm:flex-row gap-2 mb-4">
              <select
                value={commentSection}
                onChange={(e) => setCommentSection(e.target.value)}
                className="px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200"
              >
                <option>General</option>
                <option>Takeoff & Drawings</option>
                <option>Measurement Sheet</option>
                <option>Rate Analysis</option>
                <option>BOQ Cost</option>
                <option>Time Planning</option>
              </select>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add reviewer note or approval instruction..."
                className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-md bg-slate-900 dark:bg-orange-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-orange-700 whitespace-nowrap"
              >
                Post Note
              </button>
            </form>

            <div className="space-y-2.5">
              {project.comments.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {c.author}
                      </span>
                      <RoleBadge role={c.role} compact />
                      <span>·</span>
                      <span className="text-orange-600 dark:text-orange-400">{c.targetSection}</span>
                    </div>
                    <span className="font-mono">{c.timestamp.slice(0, 10)}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-1">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Create New Project from Template */}
        <div className="xl:col-span-4 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              New Project From Template
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Initialize a pre-structured BOQ, rate library linkage, and CPM schedule.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  New Project Title
                </label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g., Phase 2 Commercial Annex"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Target Country
                </label>
                <div className="relative flex items-center">
                  <Globe2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <select
                    value={templateCountry}
                    onChange={(e) => setTemplateCountry(e.target.value as CountryCode)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {COUNTRY_LIST.map((c) => (
                      <option key={c} value={c}>
                        {COUNTRY_CATALOG[c].label} ({COUNTRY_CATALOG[c].defaultCurrency} ·{' '}
                        {COUNTRY_CATALOG[c].defaultRateSchedule})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {PROJECT_TEMPLATES.map((tpl) => (
                  <label
                    key={tpl.id}
                    className={`block p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedTemplate === tpl.id
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="template"
                        checked={selectedTemplate === tpl.id}
                        onChange={() => setSelectedTemplate(tpl.id)}
                        className="mt-0.5 accent-orange-600"
                      />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {tpl.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tpl.type} · {tpl.areaLabel}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                          {tpl.summary}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  createProjectFromTemplate(
                    selectedTemplate,
                    newProjName.trim() || undefined,
                    templateCountry
                  );
                  setNewProjName('');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create & Switch to Project</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
