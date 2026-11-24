import { useMemo } from 'react';
import { canUserAccessProject, useEstimateStore } from '../store/useEstimateStore';
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
  const userMemories = useEstimateStore((s) => s.userMemories);

  const userRole = normalizeRoleName(userRoleRaw);
  const activeRoleDef = useMemo(
    () => getRoleDefinition(userRole, roleDefinitions),
    [userRole, roleDefinitions]
  );

  const activeUser = useMemo(
    () => teamUsers.find((u) => u.id === activeUserId) || teamUsers[0],
    [teamUsers, activeUserId]
  );

  const resolvedUserId = activeUser?.id || activeUserId;

  const visibleProjects = useMemo(() => {
    const list = projects.filter((p) => canUserAccessProject(p, resolvedUserId));
    return list.length > 0 ? list : projects.slice(0, 1);
  }, [projects, resolvedUserId]);

  const project = useMemo(() => {
    const raw =
      visibleProjects.find((p) => p.id === activeProjectId) ||
      visibleProjects[0] ||
      projects[0];
    return hydrateProjectOperationalData(raw);
  }, [visibleProjects, projects, activeProjectId]);

  const summary = useMemo(
    () => computeProjectSummary(project, resources),
    [project, resources]
  );

  const userMemory = userMemories[resolvedUserId];
  const isPrivateProject = project.visibility === 'private';

  return {
    project,
    visibleProjects,
    summary,
    resources,
    unitSystem,
    userRole,
    activeRoleDef,
    activeUser,
    roleDefinitions,
    userMemory,
    isPrivateProject,
  };
}
