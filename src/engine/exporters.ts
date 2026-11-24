import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CompanyProfile,
  ComputedProjectSummary,
  Project,
  ResourceRate,
  UnitSystem,
} from '../types/estimate';
import {
  convertRateDisplay,
  convertUnitDisplay,
  formatCurrency,
  formatNum,
} from './formatters';
import { computeMeasurementQty } from './calculations';

export type ReportKind =
  | 'abstract-quantities'
  | 'abstract-cost'
  | 'rate-analysis'
  | 'material-schedule'
  | 'labor-equipment'
  | 'gantt-schedule'
  | 'cash-flow'
  | 'full-estimate';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCSV(rows: Array<Record<string, string | number>>, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export function exportReportToExcel(
  kind: ReportKind,
  project: Project,
  summary: ComputedProjectSummary,
  resources: ResourceRate[],
  unitSystem: UnitSystem
) {
  const wb = XLSX.utils.book_new();

  const addAbstractQtySheet = () => {
    const data = summary.items.map((i) => {
      const conv = convertUnitDisplay(i.quantity, i.unit, unitSystem);
      return {
        'Item No.': i.itemNo,
        Category: i.category,
        Description: i.description,
        Unit: conv.unit,
        'Total Quantity': Number(conv.value.toFixed(3)),
        'Measurement Entries': i.measurementCount,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Abstract of Quantities');
  };

  const addAbstractCostSheet = () => {
    const data: Array<Record<string, string | number>> = summary.items.map((i) => {
      const conv = convertUnitDisplay(i.quantity, i.unit, unitSystem);
      const rc = convertRateDisplay(i.unitRate, i.unit, unitSystem);
      return {
        'Item No.': i.itemNo,
        Category: i.category,
        Description: i.description,
        Qty: Number(conv.value.toFixed(3)),
        Unit: conv.unit,
        [`Rate (${project.currency})`]: Number(rc.rate.toFixed(2)),
        [`Amount (${project.currency})`]: Number(i.amount.toFixed(2)),
      };
    });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: 'Direct Cost', Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.directCost.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: `Overhead (${project.overheadPct}%)`, Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.overheadAmount.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: `Contractor Profit (${project.profitPct}%)`, Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.profitAmount.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: `Taxes (${project.taxPct}%)`, Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.taxAmount.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: `Contingency (${project.contingencyPct}%)`, Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.contingencyAmount.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'SUMMARY', Description: `Escalation (${project.escalationPct}%)`, Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.escalationAmount.toFixed(2)) });
    data.push({ 'Item No.': '', Category: 'TOTAL', Description: 'GRAND TOTAL', Qty: '', Unit: '', [`Rate (${project.currency})`]: '', [`Amount (${project.currency})`]: Number(summary.grandTotal.toFixed(2)) });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Abstract of Cost (BOQ)');
  };

  const addMeasurementSheet = () => {
    const itemMap = new Map(project.boqItems.map((b) => [b.id, b]));
    const data = project.measurements.map((m) => {
      const boq = itemMap.get(m.boqItemId);
      return {
        'Sr No': m.srNo,
        'BOQ Item': boq ? `${boq.itemNo} ${boq.category}` : '',
        Description: m.description,
        No: m.isDeduction ? -m.no : m.no,
        Length: m.length,
        Breadth: m.breadth,
        Height: m.height,
        Formula: m.formula || '',
        Quantity: computeMeasurementQty(m),
        Unit: m.unit,
        Source: m.sourceDrawingName ? `${m.sourceDrawingName} (P.${m.sourcePage || 1})` : 'Manual',
        Remarks: m.remarks,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Measurement Sheet');
  };

  const addRateAnalysisSheet = () => {
    const resMap = new Map(resources.map((r) => [r.id, r]));
    const rows: Array<Record<string, string | number>> = [];
    for (const item of summary.items) {
      if (!item.rateAnalysis) continue;
      const ra = item.rateAnalysis;
      for (const m of ra.materials) {
        const res = resMap.get(m.resourceId);
        if (!res) continue;
        rows.push({
          'BOQ Item': `${item.itemNo} ${item.description.slice(0, 35)}`,
          Type: 'Material',
          Resource: res.name,
          'Base Qty': ra.baseQty,
          Qty: m.quantity,
          Unit: res.unit,
          Rate: res.rate,
          Cost: Number((m.quantity * res.rate).toFixed(2)),
        });
      }
      for (const l of ra.labor) {
        const res = resMap.get(l.resourceId);
        if (!res) continue;
        rows.push({
          'BOQ Item': `${item.itemNo} ${item.description.slice(0, 35)}`,
          Type: 'Labor',
          Resource: res.name,
          'Base Qty': ra.baseQty,
          Qty: l.quantity,
          Unit: res.unit,
          Rate: res.rate,
          Cost: Number((l.quantity * res.rate).toFixed(2)),
        });
      }
      for (const eq of ra.equipment) {
        const res = resMap.get(eq.resourceId);
        if (!res) continue;
        rows.push({
          'BOQ Item': `${item.itemNo} ${item.description.slice(0, 35)}`,
          Type: 'Equipment',
          Resource: res.name,
          'Base Qty': ra.baseQty,
          Qty: eq.quantity,
          Unit: res.unit,
          Rate: res.rate,
          Cost: Number((eq.quantity * res.rate).toFixed(2)),
        });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Rate Analysis');
  };

  const addMaterialSheet = () => {
    const data = summary.materialSchedule.map((m) => ({
      Code: m.code,
      Material: m.name,
      Group: m.categoryGroup,
      Unit: m.unit,
      'Required Quantity': Number(m.totalQty.toFixed(2)),
      [`Unit Rate (${project.currency})`]: m.unitRate,
      [`Total Cost (${project.currency})`]: Number(m.totalCost.toFixed(2)),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Material Schedule');
  };

  const addLaborEquipmentSheet = () => {
    const rows = [
      ...summary.laborSchedule.map((l) => ({
        Category: 'Labor',
        Resource: l.name,
        Trade: l.trade,
        Unit: l.unit,
        Requirement: Number(l.totalManDays.toFixed(1)),
        Rate: l.dailyRate,
        Cost: Number(l.totalCost.toFixed(2)),
      })),
      ...summary.equipmentSchedule.map((e) => ({
        Category: 'Equipment',
        Resource: e.name,
        Trade: 'Machinery',
        Unit: e.unit,
        Requirement: Number(e.totalHours.toFixed(1)),
        Rate: e.hourlyRate,
        Cost: Number(e.totalCost.toFixed(2)),
      })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Labor & Equipment');
  };

  const addScheduleSheet = () => {
    const data = summary.tasks.map((t) => ({
      'Item No': t.itemNo,
      Activity: t.name,
      Category: t.category,
      'Duration (d)': t.durationDays,
      'Early Start': `Day ${t.earlyStart + 1}`,
      'Early Finish': `Day ${t.earlyFinish}`,
      'Total Float (d)': t.totalFloat,
      'Critical Path': t.isCritical ? 'YES' : 'NO',
      'Actual Progress %': t.actualProgressPct,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'CPM Schedule');
  };

  const addCashFlowSheet = () => {
    const data = summary.cashFlow.map((c) => ({
      Month: c.label,
      [`Planned Monthly (${project.currency})`]: Number(c.plannedMonthlyCost.toFixed(2)),
      [`Planned Cumulative (${project.currency})`]: Number(c.plannedCumulativeCost.toFixed(2)),
      [`Actual Cumulative (${project.currency})`]: Number(c.actualCumulativeCost.toFixed(2)),
      'Avg Manpower': c.avgManpower,
      'Peak Manpower': c.peakManpower,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Monthly Cash Flow');
  };

  if (kind === 'abstract-quantities') addAbstractQtySheet();
  else if (kind === 'abstract-cost') addAbstractCostSheet();
  else if (kind === 'rate-analysis') addRateAnalysisSheet();
  else if (kind === 'material-schedule') addMaterialSheet();
  else if (kind === 'labor-equipment') addLaborEquipmentSheet();
  else if (kind === 'gantt-schedule') addScheduleSheet();
  else if (kind === 'cash-flow') addCashFlowSheet();
  else {
    addAbstractCostSheet();
    addAbstractQtySheet();
    addMeasurementSheet();
    addMaterialSheet();
    addLaborEquipmentSheet();
    addScheduleSheet();
    addCashFlowSheet();
  }

  const safeName = project.code.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${safeName}_${kind}.xlsx`);
}

export function exportReportToPDF(
  kind: ReportKind,
  project: Project,
  summary: ComputedProjectSummary,
  company: CompanyProfile,
  unitSystem: UnitSystem
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const titleByKind: Record<ReportKind, string> = {
    'abstract-quantities': 'Abstract of Quantities',
    'abstract-cost': 'Abstract of Cost (Bill of Quantities)',
    'rate-analysis': 'Unit Rate Analysis Schedule',
    'material-schedule': 'Material Procurement Schedule',
    'labor-equipment': 'Labor & Equipment Resource Report',
    'gantt-schedule': 'CPM Project Schedule & Activity Plan',
    'cash-flow': 'Monthly Cash Flow & S-Curve Forecast',
    'full-estimate': 'Comprehensive Construction Cost Estimate',
  };

  // Cover Page
  doc.setFillColor(15, 33, 55); // Engineering Navy
  doc.rect(0, 0, pageW, 68, 'F');
  doc.setFillColor(234, 88, 12); // Orange Accent Stripe
  doc.rect(0, 68, pageW, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(company.companyName.toUpperCase(), 18, 22);
  doc.setFontSize(22);
  doc.text(titleByKind[kind], 18, 38);
  doc.setFontSize(11);
  doc.setTextColor(203, 213, 225);
  doc.text(`${project.name} (${project.code})`, 18, 50);
  doc.text(`Client: ${project.client}  |  Location: ${project.location}`, 18, 58);

  // Project Metadata Table on Cover
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 82,
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    head: [['Project Parameter', 'Specification', 'Financial & Schedule Summary', 'Value']],
    body: [
      ['Project Type', project.type, 'Direct Construction Cost', formatCurrency(summary.directCost, project.currency)],
      ['Start Date', project.startDate, `Overhead (${project.overheadPct}%) + Profit (${project.profitPct}%)`, formatCurrency(summary.overheadAmount + summary.profitAmount, project.currency)],
      ['Rate Schedule', project.rateSchedule, `Tax (${project.taxPct}%) + Contingency (${project.contingencyPct}%)`, formatCurrency(summary.taxAmount + summary.contingencyAmount, project.currency)],
      ['Approval Status', project.approvalStatus, 'Grand Estimated Total', formatCurrency(summary.grandTotal, project.currency)],
      ['Total Labor Man-Days', `${formatNum(summary.totalLaborManDays, 0)} days`, 'Estimated Duration', `${summary.totalDurationWorkingDays} working days`],
    ],
    margin: { left: 18, right: 18 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 145;
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Amount in Words: ${summary.grandTotalInWords}`, 18, finalY + 10, { maxWidth: pageW - 36 });

  // Signature Block on Cover
  const sigY = pageH - 48;
  doc.setDrawColor(203, 213, 225);
  doc.line(18, sigY, 68, sigY);
  doc.line(80, sigY, 130, sigY);
  doc.line(142, sigY, 192, sigY);
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Prepared By: ${company.preparedBy}`, 18, sigY + 6);
  doc.text(`Reviewed By: ${company.reviewedBy}`, 80, sigY + 6);
  doc.text(`Approved By: ${company.approvedBy}`, 142, sigY + 6);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${company.address} · ${company.email} · License: ${company.licenseNo}`, 18, pageH - 16);

  const addSectionPage = (heading: string, head: string[][], body: Array<Array<string | number>>, colStyles?: Record<number, { halign?: 'left' | 'right' | 'center' }>) => {
    doc.addPage();
    doc.setFontSize(13);
    doc.setTextColor(15, 33, 55);
    doc.text(heading, 14, 18);
    autoTable(doc, {
      startY: 24,
      head,
      body,
      theme: 'striped',
      headStyles: { fillColor: [15, 33, 55], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      columnStyles: colStyles,
      margin: { left: 14, right: 14, bottom: 18 },
    });
  };

  if (kind === 'abstract-quantities' || kind === 'full-estimate') {
    addSectionPage(
      'Abstract of Quantities',
      [['Item No.', 'Category', 'Description of Work', 'Unit', 'Total Qty']],
      summary.items.map((i) => {
        const conv = convertUnitDisplay(i.quantity, i.unit, unitSystem);
        return [i.itemNo, i.category, i.description, conv.unit, formatNum(conv.value, 2)];
      }),
      { 4: { halign: 'right' } }
    );
  }

  if (kind === 'abstract-cost' || kind === 'full-estimate') {
    const costRows = summary.items.map((i) => {
      const conv = convertUnitDisplay(i.quantity, i.unit, unitSystem);
      const rc = convertRateDisplay(i.unitRate, i.unit, unitSystem);
      return [
        i.itemNo,
        i.description,
        formatNum(conv.value, 2),
        conv.unit,
        formatCurrency(rc.rate, project.currency),
        formatCurrency(i.amount, project.currency),
      ];
    });
    costRows.push(['', 'Direct Cost Subtotal', '', '', '', formatCurrency(summary.directCost, project.currency)]);
    costRows.push(['', `Overhead (${project.overheadPct}%) + Profit (${project.profitPct}%)`, '', '', '', formatCurrency(summary.overheadAmount + summary.profitAmount, project.currency)]);
    costRows.push(['', `Taxes (${project.taxPct}%) + Contingency (${project.contingencyPct}%) + Escalation (${project.escalationPct}%)`, '', '', '', formatCurrency(summary.taxAmount + summary.contingencyAmount + summary.escalationAmount, project.currency)]);
    costRows.push(['', 'GRAND TOTAL', '', '', '', formatCurrency(summary.grandTotal, project.currency)]);

    addSectionPage(
      'Abstract of Cost (Bill of Quantities)',
      [['Item', 'Description', 'Qty', 'Unit', 'Unit Rate', 'Amount']],
      costRows,
      { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    );
  }

  if (kind === 'material-schedule' || kind === 'full-estimate') {
    addSectionPage(
      'Material Procurement Schedule',
      [['Code', 'Material Description', 'Group', 'Qty', 'Unit', 'Unit Rate', 'Total Cost']],
      summary.materialSchedule.map((m) => [
        m.code,
        m.name,
        m.categoryGroup,
        formatNum(m.totalQty, 2),
        m.unit,
        formatCurrency(m.unitRate, project.currency),
        formatCurrency(m.totalCost, project.currency),
      ]),
      { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
    );
  }

  if (kind === 'labor-equipment' || kind === 'full-estimate') {
    addSectionPage(
      'Labor & Equipment Resource Schedule',
      [['Type', 'Resource / Trade', 'Requirement', 'Unit', 'Rate', 'Total Cost']],
      [
        ...summary.laborSchedule.map((l) => [
          'Labor',
          l.name,
          formatNum(l.totalManDays, 1),
          l.unit,
          formatCurrency(l.dailyRate, project.currency),
          formatCurrency(l.totalCost, project.currency),
        ]),
        ...summary.equipmentSchedule.map((e) => [
          'Equipment',
          e.name,
          formatNum(e.totalHours, 1),
          e.unit,
          formatCurrency(e.hourlyRate, project.currency),
          formatCurrency(e.totalCost, project.currency),
        ]),
      ],
      { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    );
  }

  if (kind === 'gantt-schedule' || kind === 'full-estimate') {
    addSectionPage(
      'CPM Project Schedule & Critical Path',
      [['Item', 'Activity', 'Dur (d)', 'Start', 'Finish', 'Float', 'Critical']],
      summary.tasks.map((t) => [
        t.itemNo,
        t.name,
        t.durationDays,
        `D${t.earlyStart + 1}`,
        `D${t.earlyFinish}`,
        `${t.totalFloat}d`,
        t.isCritical ? 'CRITICAL' : 'Normal',
      ]),
      { 2: { halign: 'right' }, 5: { halign: 'right' } }
    );
  }

  if (kind === 'cash-flow' || kind === 'full-estimate') {
    addSectionPage(
      'Monthly Cash Flow Forecast',
      [['Period', 'Monthly Planned', 'Cumulative Planned', 'Cumulative Actual', 'Peak Workers']],
      summary.cashFlow.map((c) => [
        c.label,
        formatCurrency(c.plannedMonthlyCost, project.currency),
        formatCurrency(c.plannedCumulativeCost, project.currency),
        formatCurrency(c.actualCumulativeCost, project.currency),
        c.peakManpower,
      ]),
      { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
    );
  }

  if (kind === 'rate-analysis') {
    addSectionPage(
      'Unit Rate Analysis Breakdown',
      [['Item No.', 'Work Description', 'Unit', 'Materials', 'Labor', 'Equipment', 'Unit Rate']],
      summary.items.map((i) => [
        i.itemNo,
        i.description,
        i.unit,
        formatCurrency(i.materialUnitCost, project.currency),
        formatCurrency(i.laborUnitCost, project.currency),
        formatCurrency(i.equipmentUnitCost, project.currency),
        formatCurrency(i.unitRate, project.currency),
      ]),
      {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      }
    );
  }

  // Page Numbers & Running Header
  const totalPages = doc.getNumberOfPages();
  const copyrightYear = new Date().getFullYear();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `© ${copyrightYear} Zaim Splash Studio`,
      14,
      pageH - 8
    );
    doc.text(
      `CivilEstimate Pro · ${project.code} · Page ${p} of ${totalPages}`,
      pageW - 14,
      pageH - 8,
      { align: 'right' }
    );
  }

  const safeName = project.code.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeName}_${kind}.pdf`);
}
