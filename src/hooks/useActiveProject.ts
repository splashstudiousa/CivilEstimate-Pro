import { useMemo } from 'react';
import { useEstimateStore } from '../store/useEstimateStore';
import { computeProjectSummary } from '../engine/calculations';
import { hydrateProjectOperationalData } from '../data/sampleOperationalData';
import { getRoleDefinition, normalizeRoleName } from '../data/roles';

export function useActiveProject() {
  const projects = useEstimateStore((s) => s.projects);
  const activeProjectId = useEstimateStore((s) => s.activeProjectId);
  const resources = useEstimateStore((s) => s.resources);
  const unitSystem = useEstimateStore((s) => s.unitSystem);
  const userRoleRaw = useEstimateStore((s) => s.userRole);
  const roleDefinitions = useEstimateStore((s) => s.roleDefinitions);
  const teamUsers = useEstimateStore((s) => s.teamUsers);
  const activeUserId = useEstimateStore((s) => s.activeUserId);

  const userRole = normalizeRoleName(userRoleRaw);
  const activeRoleDef = useMemo(
    () => getRoleDefinition(userRole, roleDefinitions),
    [userRole, roleDefinitions]
  );

  const activeUser = useMemo(
    () => teamUsers.find((u) => u.id === activeUserId) || teamUsers[0],
    [teamUsers, activeUserId]
  );

  const project = useMemo(() => {
    const raw = projects.find((p) => p.id === activeProjectId) || projects[0];
    return hydrateProjectOperationalData(raw);
  }, [projects, activeProjectId]);

  const summary = useMemo(
    () => computeProjectSummary(project, resources),
    [project, resources]
  );

  return {
    project,
    summary,
    resources,
    unitSystem,
    userRole,
    activeRoleDef,
    activeUser,
    roleDefinitions,
  };
}
