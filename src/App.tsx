import { useEffect, useState } from 'react';
import { useEstimateStore } from './store/useEstimateStore';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { HomeDashboard } from './components/modules/HomeDashboard';
import { ProjectSetup } from './components/modules/ProjectSetup';
import { DrawingTakeoffModule } from './components/modules/DrawingTakeoffModule';
import { DrawingToEstimateModule } from './components/modules/DrawingToEstimateModule';
import { ManualMeasurementSheet } from './components/modules/ManualMeasurementSheet';
import { RateAnalysisModule } from './components/modules/RateAnalysisModule';
import { AbstractOfQuantities } from './components/modules/AbstractOfQuantities';
import { AbstractOfCost } from './components/modules/AbstractOfCost';
import { MaterialSchedule } from './components/modules/MaterialSchedule';
import { LaborEquipmentModule } from './components/modules/LaborEquipmentModule';
import { TimePlanningGantt } from './components/modules/TimePlanningGantt';
import { ReportsExportModule } from './components/modules/ReportsExportModule';
import { SettingsAdminModule } from './components/modules/SettingsAdminModule';
import { ProjectPlannerModule } from './components/modules/ProjectPlannerModule';
import { CollaborationWorkflowModule } from './components/modules/CollaborationWorkflowModule';
import { UnitConverterModule } from './components/modules/UnitConverterModule';
import { useActiveProject } from './hooks/useActiveProject';
import { hasModulePermission } from './data/roles';

export default function App() {
  const activeModule = useEstimateStore((s) => s.activeModule);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const theme = useEstimateStore((s) => s.theme);
  const { userRole, activeRoleDef, roleDefinitions } = useActiveProject();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const canViewModule =
    activeModule === 'dashboard' ||
    hasModulePermission(userRole, activeModule, 'view', roleDefinitions);

  const renderModule = () => {
    if (!canViewModule) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center max-w-lg mx-auto mt-10 space-y-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            Module Restricted for {activeRoleDef.name}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your current role permissions do not include view access to this module. Switch roles or request access from Admin.
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="px-4 py-2 rounded-md bg-orange-600 text-white text-xs font-semibold"
          >
            Return to Role Dashboard
          </button>
        </div>
      );
    }

    switch (activeModule) {
      case 'dashboard':
        return <HomeDashboard />;
      case 'setup':
        return <ProjectSetup />;
      case 'takeoff':
        return <DrawingTakeoffModule />;
      case 'pipeline':
        return <DrawingToEstimateModule />;
      case 'measurements':
        return <ManualMeasurementSheet />;
      case 'rate-analysis':
        return <RateAnalysisModule />;
      case 'abstract-quantities':
        return <AbstractOfQuantities />;
      case 'abstract-cost':
        return <AbstractOfCost />;
      case 'materials':
        return <MaterialSchedule />;
      case 'labor-equipment':
        return <LaborEquipmentModule />;
      case 'timeline':
        return <TimePlanningGantt />;
      case 'planner':
        return <ProjectPlannerModule />;
      case 'collaboration':
        return <CollaborationWorkflowModule />;
      case 'unit-converter':
        return <UnitConverterModule />;
      case 'reports':
        return <ReportsExportModule />;
      case 'settings':
        return <SettingsAdminModule />;
      default:
        return <HomeDashboard />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {renderModule()}
        </main>
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 px-4 sm:px-6 py-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1600px] w-full mx-auto">
          <div>
            © {new Date().getFullYear()} <strong className="font-semibold text-slate-700 dark:text-slate-200">Zaim Splash Studio</strong> · All Rights Reserved
          </div>
          <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
            CivilEstimate Pro · Engineering Costing &amp; Project Controls
          </div>
        </footer>
      </div>
    </div>
  );
}
