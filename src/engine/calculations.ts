import {
  BOQItem,
  CashFlowPeriod,
  ComputedBOQItem,
  ComputedProjectSummary,
  CPMTask,
  EquipmentSummaryRow,
  EVMStats,
  LaborSummaryRow,
  MaterialSummaryRow,
  MeasurementRow,
  Project,
  RateAnalysis,
  ResourceRate,
  SystemAlert,
  WORK_CATEGORIES,
  WorkCategory,
} from '../types/estimate';
import { numberToWords } from './formatters';

/**
 * Safe mathematical expression evaluator for measurement sheet formulas.
 * Supports +, -, *, /, parentheses, and decimal numbers.
 */
export function evaluateFormula(expr?: string): number | null {
  if (!expr || !expr.trim()) return null;
  const cleaned = expr.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
    return null;
  }
  try {
    const tokens = cleaned.match(/(\d+(\.\d+)?|[+\-*/()])/g);
    if (!tokens) return null;
    let pos = 0;

    function parseExpr(): number {
      let left = parseTerm();
      while (tokens && pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
        const op = tokens[pos++];
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }

    function parseTerm(): number {
      let left = parseFactor();
      while (tokens && pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
        const op = tokens[pos++];
        const right = parseFactor();
        left = op === '*' ? left * right : right === 0 ? 0 : left / right;
      }
      return left;
    }

    function parseFactor(): number {
      if (!tokens || pos >= tokens.length) return 0;
      const tok = tokens[pos];
      if (tok === '(') {
        pos++;
        const val = parseExpr();
        if (tokens[pos] === ')') pos++;
        return val;
      }
      if (tok === '-') {
        pos++;
        return -parseFactor();
      }
      if (tok === '+') {
        pos++;
        return parseFactor();
      }
      pos++;
      const num = parseFloat(tok);
      return Number.isFinite(num) ? num : 0;
    }

    const result = parseExpr();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Computes measurement quantity from No x L x B x H or custom formula.
 * Dimensions equal to 0 are omitted from multiplication unless all L/B/H are 0 (count-based item).
 */
export function computeMeasurementQty(row: MeasurementRow): number {
  const count = Number.isFinite(row.no) ? row.no : 0;
  if (count === 0) return 0;

  let raw = 0;
  const formulaVal = evaluateFormula(row.formula);
  if (formulaVal !== null) {
    raw = count * formulaVal;
  } else {
    const dims = [row.length, row.breadth, row.height].filter(
      (v) => Number.isFinite(v) && v > 0
    );
    if (dims.length === 0) {
      raw = count;
    } else {
      raw = count * dims.reduce((acc, v) => acc * v, 1);
    }
  }

  const signed = row.isDeduction ? -Math.abs(raw) : raw;
  return Math.round(signed * 1000) / 1000;
}

export function computeRateAnalysisBreakdown(
  ra: RateAnalysis,
  resourceMap: Map<string, ResourceRate>
) {
  const baseQty = ra.baseQty > 0 ? ra.baseQty : 1;

  let matDirect = 0;
  for (const line of ra.materials) {
    const res = resourceMap.get(line.resourceId);
    if (res) matDirect += line.quantity * res.rate;
  }

  let labDirect = 0;
  for (const line of ra.labor) {
    const res = resourceMap.get(line.resourceId);
    if (res) labDirect += line.quantity * res.rate;
  }

  let eqDirect = 0;
  for (const line of ra.equipment) {
    const res = resourceMap.get(line.resourceId);
    if (res) eqDirect += line.quantity * res.rate;
  }

  const wastageMultiplier = 1 + (ra.wastagePct || 0) / 100;
  const locationFactor = ra.locationFactor > 0 ? ra.locationFactor : 1;
  const escalationMultiplier = 1 + (ra.escalationPct || 0) / 100;
  const combinedMultiplier = wastageMultiplier * locationFactor * escalationMultiplier;

  const materialUnitCost = (matDirect * combinedMultiplier) / baseQty;
  const laborUnitCost = (labDirect * locationFactor * escalationMultiplier) / baseQty;
  const equipmentUnitCost = (eqDirect * locationFactor * escalationMultiplier) / baseQty;
  const unitRate = materialUnitCost + laborUnitCost + equipmentUnitCost;

  return {
    matDirect,
    labDirect,
    eqDirect,
    materialUnitCost,
    laborUnitCost,
    equipmentUnitCost,
    wastageMultiplier,
    unitRate,
  };
}

export function computeCPMSchedule(
  computedItems: ComputedBOQItem[],
  calendarWorkingDaysPerWeek: number,
  weatherBufferDays: number,
  manpowerCapacity = 16
): {
  tasks: CPMTask[];
  totalWorkingDays: number;
  totalCalendarDays: number;
  overAllocatedBuckets: number;
  manpowerHistogram: Array<{
    dayLabel: string;
    day: number;
    workers: number;
    capacity: number;
    overAllocated: boolean;
  }>;
} {
  const itemMap = new Map<string, ComputedBOQItem>();
  computedItems.forEach((i) => itemMap.set(i.id, i));

  // Build initial task nodes
  const taskMap = new Map<string, CPMTask>();
  for (const item of computedItems) {
    const prod = item.productivityPerDay > 0 ? item.productivityPerDay : 10;
    const crew = item.crewSize > 0 ? item.crewSize : 1;
    const autoDur = item.isMilestone
      ? 0
      : Math.max(1, Math.ceil(Math.max(0.01, item.quantity) / (prod * crew)));
    const durationDays =
      item.manualDurationDays !== undefined && item.manualDurationDays >= 0
        ? item.manualDurationDays
        : autoDur;

    // Estimate labor man-days from rate analysis labor lines or crew * duration
    let laborManDays = 0;
    if (item.rateAnalysis && item.rateAnalysis.labor.length > 0) {
      const base = item.rateAnalysis.baseQty > 0 ? item.rateAnalysis.baseQty : 1;
      const perUnitManDays = item.rateAnalysis.labor.reduce((s, l) => s + l.quantity, 0) / base;
      laborManDays = perUnitManDays * item.quantity;
    } else {
      laborManDays = durationDays * crew * 2;
    }

    const initStart =
      item.constraintType === 'SNET' && item.constraintDay !== undefined
        ? Math.max(item.startOffsetDays || 0, item.constraintDay)
        : item.startOffsetDays || 0;

    taskMap.set(item.id, {
      boqItemId: item.id,
      itemNo: item.itemNo,
      category: item.category,
      name: item.description,
      quantity: item.quantity,
      unit: item.unit,
      productivityPerDay: prod,
      crewSize: crew,
      durationDays,
      earlyStart: initStart,
      earlyFinish: initStart + durationDays,
      lateStart: 0,
      lateFinish: 0,
      totalFloat: 0,
      isCritical: false,
      baselineStartDay: item.baselineStartDay ?? 0,
      baselineDurationDays: item.baselineDurationDays ?? durationDays,
      actualProgressPct: item.actualProgressPct || 0,
      isMilestone: Boolean(item.isMilestone),
      cost: item.amount,
      laborManDays,
      dependencies: item.dependencies || [],
      constraintType: item.constraintType || 'ASAP',
      constraintDay: item.constraintDay,
      assignedTeamLeader: item.assignedTeamLeader,
      wbsNodeId: item.wbsNodeId,
      assignedResourceIds: item.assignedResourceIds,
    });
  }

  // Forward pass supporting FS, SS, FF, SF + SNET constraint
  const ids = Array.from(taskMap.keys());
  for (let pass = 0; pass < ids.length + 2; pass++) {
    let changed = false;
    for (const id of ids) {
      const task = taskMap.get(id)!;
      const item = itemMap.get(id)!;
      let es = item.startOffsetDays || 0;
      if (item.constraintType === 'SNET' && item.constraintDay !== undefined) {
        es = Math.max(es, item.constraintDay);
      }
      for (const dep of task.dependencies) {
        const pred = taskMap.get(dep.predecessorId);
        if (!pred) continue;
        const lag = dep.lagDays || 0;
        let candidate = es;
        if (dep.type === 'FS') {
          candidate = pred.earlyFinish + lag;
        } else if (dep.type === 'SS') {
          candidate = pred.earlyStart + lag;
        } else if (dep.type === 'FF') {
          candidate = pred.earlyFinish + lag - task.durationDays;
        } else if (dep.type === 'SF') {
          candidate = pred.earlyStart + lag - task.durationDays;
        }
        if (candidate > es) es = Math.max(0, candidate);
      }
      const ef = es + task.durationDays;
      if (es !== task.earlyStart || ef !== task.earlyFinish) {
        task.earlyStart = es;
        task.earlyFinish = ef;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxFinish = Math.max(
    1,
    ...Array.from(taskMap.values()).map((t) => t.earlyFinish)
  );

  // Backward pass supporting FS, SS, FF, SF + FNLT constraint
  for (const task of taskMap.values()) {
    const fnlt =
      task.constraintType === 'FNLT' && task.constraintDay !== undefined
        ? Math.min(maxFinish, task.constraintDay)
        : maxFinish;
    task.lateFinish = fnlt;
    task.lateStart = fnlt - task.durationDays;
  }

  for (let pass = 0; pass < ids.length + 2; pass++) {
    let changed = false;
    for (const id of ids) {
      const pred = taskMap.get(id)!;
      let lf =
        pred.constraintType === 'FNLT' && pred.constraintDay !== undefined
          ? Math.min(maxFinish, pred.constraintDay)
          : maxFinish;
      for (const succId of ids) {
        const succ = taskMap.get(succId)!;
        for (const dep of succ.dependencies) {
          if (dep.predecessorId === id) {
            const lag = dep.lagDays || 0;
            let constraint = lf;
            if (dep.type === 'FS') {
              constraint = succ.lateStart - lag;
            } else if (dep.type === 'SS') {
              constraint = succ.lateStart - lag + pred.durationDays;
            } else if (dep.type === 'FF') {
              constraint = succ.lateFinish - lag;
            } else if (dep.type === 'SF') {
              constraint = succ.lateFinish - lag + pred.durationDays;
            }
            if (constraint < lf) lf = constraint;
          }
        }
      }
      const ls = lf - pred.durationDays;
      if (lf !== pred.lateFinish || ls !== pred.lateStart) {
        pred.lateFinish = lf;
        pred.lateStart = ls;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const tasks = Array.from(taskMap.values()).map((t) => {
    const totalFloat = Math.max(0, t.lateStart - t.earlyStart);
    return {
      ...t,
      totalFloat,
      isCritical: totalFloat === 0 && (t.durationDays > 0 || t.isMilestone),
    };
  });

  const totalWorkingDays = maxFinish + (weatherBufferDays || 0);
  const ratio = 7 / Math.max(1, calendarWorkingDaysPerWeek || 6);
  const totalCalendarDays = Math.ceil(totalWorkingDays * ratio);

  // Build manpower histogram across project working days (bucketed by week if > 45 days)
  const bucketSize = totalWorkingDays > 45 ? 5 : 1;
  const numBuckets = Math.max(1, Math.ceil(totalWorkingDays / bucketSize));
  const manpowerHistogram: Array<{
    dayLabel: string;
    day: number;
    workers: number;
    capacity: number;
    overAllocated: boolean;
  }> = [];
  let overAllocatedBuckets = 0;

  for (let b = 0; b < numBuckets; b++) {
    const startD = b * bucketSize;
    const endD = startD + bucketSize;
    let totalWorkersInBucket = 0;
    let activeDaysCount = 0;

    for (let d = startD; d < endD; d++) {
      let dayWorkers = 0;
      for (const t of tasks) {
        if (t.durationDays > 0 && d >= t.earlyStart && d < t.earlyFinish) {
          dayWorkers += Math.max(1, t.laborManDays / t.durationDays);
        }
      }
      totalWorkersInBucket += dayWorkers;
      activeDaysCount++;
    }
    const avgWorkers = Math.round(totalWorkersInBucket / Math.max(1, activeDaysCount));
    const overAllocated = avgWorkers > manpowerCapacity;
    if (overAllocated) overAllocatedBuckets++;
    manpowerHistogram.push({
      dayLabel: bucketSize > 1 ? `Wk ${b + 1}` : `D${b + 1}`,
      day: startD + 1,
      workers: avgWorkers,
      capacity: manpowerCapacity,
      overAllocated,
    });
  }

  return {
    tasks,
    totalWorkingDays,
    totalCalendarDays,
    overAllocatedBuckets,
    manpowerHistogram,
  };
}

export function computeProjectSummary(
  project: Project,
  resources: ResourceRate[]
): ComputedProjectSummary {
  const resourceMap = new Map<string, ResourceRate>();
  resources.forEach((r) => resourceMap.set(r.id, r));

  const raByItemId = new Map<string, RateAnalysis>();
  project.rateAnalyses.forEach((ra) => raByItemId.set(ra.boqItemId, ra));

  // Group measurements by boqItemId
  const qtyByItem = new Map<string, { qty: number; count: number }>();
  for (const row of project.measurements) {
    const q = computeMeasurementQty(row);
    const prev = qtyByItem.get(row.boqItemId) || { qty: 0, count: 0 };
    qtyByItem.set(row.boqItemId, {
      qty: Math.round((prev.qty + q) * 1000) / 1000,
      count: prev.count + 1,
    });
  }

  // Material, Labor, Equipment accumulators
  const materialTotals = new Map<string, { qty: number; cost: number }>();
  const laborTotals = new Map<string, { manDays: number; cost: number }>();
  const equipmentTotals = new Map<string, { hours: number; cost: number }>();

  const computedItems: ComputedBOQItem[] = project.boqItems.map((item: BOQItem) => {
    const mInfo = qtyByItem.get(item.id) || { qty: 0, count: 0 };
    const quantity = Math.max(0, mInfo.qty);
    const ra = raByItemId.get(item.id);

    let unitRate = item.manualRate || 0;
    let materialUnitCost = unitRate * 0.62;
    let laborUnitCost = unitRate * 0.28;
    let equipmentUnitCost = unitRate * 0.10;
    let wastageFactor = 1;

    if (item.useRateAnalysis && ra) {
      const breakdown = computeRateAnalysisBreakdown(ra, resourceMap);
      unitRate = breakdown.unitRate;
      materialUnitCost = breakdown.materialUnitCost;
      laborUnitCost = breakdown.laborUnitCost;
      equipmentUnitCost = breakdown.equipmentUnitCost;
      wastageFactor = breakdown.wastageMultiplier;

      const base = ra.baseQty > 0 ? ra.baseQty : 1;
      const loc = ra.locationFactor > 0 ? ra.locationFactor : 1;
      const esc = 1 + (ra.escalationPct || 0) / 100;

      for (const m of ra.materials) {
        const res = resourceMap.get(m.resourceId);
        if (!res) continue;
        const totalMatQty = (m.quantity / base) * quantity * wastageFactor;
        const totalMatCost = totalMatQty * res.rate * loc * esc;
        const cur = materialTotals.get(res.id) || { qty: 0, cost: 0 };
        materialTotals.set(res.id, {
          qty: cur.qty + totalMatQty,
          cost: cur.cost + totalMatCost,
        });
      }

      for (const l of ra.labor) {
        const res = resourceMap.get(l.resourceId);
        if (!res) continue;
        const totalLabDays = (l.quantity / base) * quantity;
        const totalLabCost = totalLabDays * res.rate * loc * esc;
        const cur = laborTotals.get(res.id) || { manDays: 0, cost: 0 };
        laborTotals.set(res.id, {
          manDays: cur.manDays + totalLabDays,
          cost: cur.cost + totalLabCost,
        });
      }

      for (const eq of ra.equipment) {
        const res = resourceMap.get(eq.resourceId);
        if (!res) continue;
        const totalEqHours = (eq.quantity / base) * quantity;
        const totalEqCost = totalEqHours * res.rate * loc * esc;
        const cur = equipmentTotals.get(res.id) || { hours: 0, cost: 0 };
        equipmentTotals.set(res.id, {
          hours: cur.hours + totalEqHours,
          cost: cur.cost + totalEqCost,
        });
      }
    }

    const amount = quantity * unitRate;
    const materialCost = quantity * materialUnitCost;
    const laborCost = quantity * laborUnitCost;
    const equipmentCost = quantity * equipmentUnitCost;

    return {
      ...item,
      quantity,
      measurementCount: mInfo.count,
      unitRate,
      materialUnitCost,
      laborUnitCost,
      equipmentUnitCost,
      wastageFactor,
      amount,
      materialCost,
      laborCost,
      equipmentCost,
      rateAnalysis: ra,
    };
  });

  const directCost = computedItems.reduce((s, i) => s + i.amount, 0);
  const materialCost = computedItems.reduce((s, i) => s + i.materialCost, 0);
  const laborCost = computedItems.reduce((s, i) => s + i.laborCost, 0);
  const equipmentCost = computedItems.reduce((s, i) => s + i.equipmentCost, 0);

  const overheadAmount = directCost * (project.overheadPct / 100);
  const profitAmount = (directCost + overheadAmount) * (project.profitPct / 100);
  const preTaxSubtotal = directCost + overheadAmount + profitAmount;
  const taxAmount = preTaxSubtotal * (project.taxPct / 100);
  const contingencyAmount = directCost * (project.contingencyPct / 100);
  const escalationAmount = directCost * (project.escalationPct / 100);
  const grandTotal = preTaxSubtotal + taxAmount + contingencyAmount + escalationAmount;

  const categoryTotals = {} as Record<
    WorkCategory,
    { quantityItems: number; directCost: number; sharePct: number }
  >;
  for (const cat of WORK_CATEGORIES) {
    categoryTotals[cat] = { quantityItems: 0, directCost: 0, sharePct: 0 };
  }
  for (const item of computedItems) {
    categoryTotals[item.category].quantityItems += 1;
    categoryTotals[item.category].directCost += item.amount;
  }
  for (const cat of WORK_CATEGORIES) {
    categoryTotals[cat].sharePct =
      directCost > 0 ? (categoryTotals[cat].directCost / directCost) * 100 : 0;
  }

  const materialSchedule: MaterialSummaryRow[] = Array.from(materialTotals.entries())
    .map(([resourceId, val]) => {
      const res = resourceMap.get(resourceId)!;
      return {
        resourceId,
        code: res.code,
        name: res.name,
        unit: res.unit,
        totalQty: val.qty,
        unitRate: res.rate,
        totalCost: val.cost,
        categoryGroup: res.tradeOrGroup,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);

  const laborSchedule: LaborSummaryRow[] = Array.from(laborTotals.entries())
    .map(([resourceId, val]) => {
      const res = resourceMap.get(resourceId)!;
      return {
        resourceId,
        name: res.name,
        trade: res.tradeOrGroup,
        unit: res.unit,
        totalManDays: val.manDays,
        dailyRate: res.rate,
        totalCost: val.cost,
      };
    })
    .sort((a, b) => b.totalManDays - a.totalManDays);

  const equipmentSchedule: EquipmentSummaryRow[] = Array.from(equipmentTotals.entries())
    .map(([resourceId, val]) => {
      const res = resourceMap.get(resourceId)!;
      return {
        resourceId,
        name: res.name,
        unit: res.unit,
        totalHours: val.hours,
        hourlyRate: res.rate,
        totalCost: val.cost,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);

  const totalLaborManDays = laborSchedule.reduce((s, r) => s + r.totalManDays, 0);
  const totalEquipmentHours = equipmentSchedule.reduce((s, r) => s + r.totalHours, 0);

  const { tasks, totalWorkingDays, totalCalendarDays, overAllocatedBuckets, manpowerHistogram } =
    computeCPMSchedule(
      computedItems,
      project.calendar.workingDaysPerWeek,
      project.calendar.weatherBufferDays
    );

  // Build Monthly Cash Flow & S-Curve (Planned, Earned, Actual)
  const daysPerMonth = 26;
  const numMonths = Math.max(1, Math.ceil(totalWorkingDays / daysPerMonth));
  const startDt = new Date(project.startDate || '2026-11-01');
  const overheadMultiplier = directCost > 0 ? grandTotal / directCost : 1;

  const cashFlow: CashFlowPeriod[] = [];
  let runningPlanned = 0;
  let runningEarned = 0;
  let runningActual = 0;

  for (let m = 0; m < numMonths; m++) {
    const mStart = m * daysPerMonth;
    const mEnd = (m + 1) * daysPerMonth;
    let monthDirectCost = 0;
    let monthEarnedCost = 0;
    let totalWorkersInMonth = 0;
    let peakWorkers = 0;

    for (const t of tasks) {
      if (t.durationDays <= 0) continue;
      const overlapStart = Math.max(mStart, t.earlyStart);
      const overlapEnd = Math.min(mEnd, t.earlyFinish);
      if (overlapEnd > overlapStart) {
        const fraction = (overlapEnd - overlapStart) / t.durationDays;
        monthDirectCost += t.cost * fraction;
        monthEarnedCost += t.cost * fraction * (t.actualProgressPct / 100);
      }
    }

    for (let d = mStart; d < mEnd; d++) {
      let dw = 0;
      for (const t of tasks) {
        if (t.durationDays > 0 && d >= t.earlyStart && d < t.earlyFinish) {
          dw += t.laborManDays / t.durationDays;
        }
      }
      totalWorkersInMonth += dw;
      if (dw > peakWorkers) peakWorkers = dw;
    }

    const plannedMonthlyCost = monthDirectCost * overheadMultiplier;
    const earnedMonthlyCost = monthEarnedCost * overheadMultiplier;
    // Actual cost reflects billed/committed cost slightly ahead or tracked against earned
    const actualMonthlyCost = earnedMonthlyCost * 1.03;
    runningPlanned += plannedMonthlyCost;
    runningEarned += earnedMonthlyCost;
    runningActual += actualMonthlyCost;

    const labelDate = new Date(startDt.getFullYear(), startDt.getMonth() + m, 1);
    const label = labelDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    cashFlow.push({
      monthIndex: m + 1,
      label,
      plannedMonthlyCost,
      plannedCumulativeCost: runningPlanned,
      earnedCumulativeCost: runningEarned,
      actualCumulativeCost: runningActual,
      peakManpower: Math.ceil(peakWorkers),
      avgManpower: Math.round(totalWorkersInMonth / daysPerMonth),
    });
  }

  // Earned Value Management (EVM)
  const statusDay = Math.min(totalWorkingDays, Math.max(1, project.statusDay ?? 18));
  const bac = grandTotal;
  let pvDirect = 0;
  let evDirect = 0;
  for (const t of tasks) {
    if (t.durationDays > 0) {
      const plannedElapsed = Math.max(0, Math.min(t.durationDays, statusDay - t.earlyStart));
      pvDirect += t.cost * (plannedElapsed / t.durationDays);
    }
    evDirect += t.cost * (t.actualProgressPct / 100);
  }
  const pv = pvDirect * overheadMultiplier;
  const ev = evDirect * overheadMultiplier;
  const billedGross = (project.raBills || []).reduce((s, b) => s + b.grossAmount, 0);
  const ac = billedGross > 0 ? Math.max(billedGross * 0.85, ev * 1.03) : ev * 1.03;
  const sv = ev - pv;
  const cv = ev - ac;
  const spi = pv > 0 ? ev / pv : 1;
  const cpi = ac > 0 ? ev / ac : 1;
  const eac = cpi > 0.1 ? bac / cpi : bac;
  const vac = bac - eac;
  const forecastWorkingDays = spi > 0.1 ? Math.ceil(totalWorkingDays / spi) : totalWorkingDays;
  const overallProgressPct = bac > 0 ? (ev / bac) * 100 : 0;

  const evm: EVMStats = {
    statusDay,
    bac,
    pv,
    ev,
    ac,
    sv,
    cv,
    spi,
    cpi,
    eac,
    vac,
    forecastWorkingDays,
    overallProgressPct,
  };

  // Alerts engine (real data checks)
  const alerts: SystemAlert[] = [];
  const outdatedRates = resources.filter((r) => r.isOutdated);
  if (outdatedRates.length > 0) {
    alerts.push({
      id: 'alert-outdated-rates',
      severity: 'warning',
      title: `${outdatedRates.length} resource rates flagged for review`,
      description: `${outdatedRates.slice(0, 3).map((r) => r.name).join(', ')} have aged market quotes.`,
      module: 'rate-analysis',
    });
  }
  const missingQtyItems = computedItems.filter((i) => !i.isMilestone && i.quantity === 0);
  if (missingQtyItems.length > 0) {
    alerts.push({
      id: 'alert-missing-qty',
      severity: 'error',
      title: `${missingQtyItems.length} BOQ items have zero measured quantity`,
      description: `Add takeoff measurements or manual entries for ${missingQtyItems[0].itemNo} ${missingQtyItems[0].description}.`,
      module: 'measurements',
    });
  }
  const missingRateItems = computedItems.filter((i) => !i.isMilestone && i.unitRate === 0);
  if (missingRateItems.length > 0) {
    alerts.push({
      id: 'alert-missing-rate',
      severity: 'error',
      title: `${missingRateItems.length} BOQ items have zero unit rate`,
      description: `Configure Rate Analysis or enter a manual rate for ${missingRateItems[0].itemNo}.`,
      module: 'rate-analysis',
    });
  }
  if (overAllocatedBuckets > 0) {
    alerts.push({
      id: 'alert-overallocation',
      severity: 'warning',
      title: `${overAllocatedBuckets} schedule periods exceed daily crew capacity`,
      description: `Open Project Planner to level non-critical activities within float.`,
      module: 'planner',
    });
  }
  const criticalCount = tasks.filter((t) => t.isCritical).length;
  if (criticalCount > 0) {
    alerts.push({
      id: 'alert-critical-path',
      severity: 'info',
      title: `${criticalCount} critical path activities governing ${totalWorkingDays}d duration`,
      description: `Delays on critical items directly shift project completion.`,
      module: 'planner',
    });
  }

  return {
    items: computedItems,
    categoryTotals,
    directCost,
    materialCost,
    laborCost,
    equipmentCost,
    overheadAmount,
    profitAmount,
    taxAmount,
    contingencyAmount,
    escalationAmount,
    grandTotal,
    grandTotalInWords: numberToWords(grandTotal, project.currency),
    costPerAreaUnit: project.builtUpArea > 0 ? grandTotal / project.builtUpArea : 0,
    totalLaborManDays,
    totalEquipmentHours,
    totalDurationWorkingDays: totalWorkingDays,
    totalDurationCalendarDays: totalCalendarDays,
    tasks,
    cashFlow,
    manpowerHistogram,
    evm,
    overAllocatedBuckets,
    materialSchedule,
    laborSchedule,
    equipmentSchedule,
    alerts,
  };
}
