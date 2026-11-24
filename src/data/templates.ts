import { CountryCode, Project } from '../types/estimate';
import { getCountryProfile } from './countryCatalog';
import { SAMPLE_HOUSE_PROJECT } from './sampleProject';

export interface ProjectTemplate {
  id: string;
  name: string;
  type: Project['type'];
  areaLabel: string;
  summary: string;
  buildProject: (customName?: string, country?: CountryCode) => Project;
}

function applyCountryMetadata(p: Project, country?: CountryCode, typeOverride?: Record<CountryCode, string>): Project {
  const c: CountryCode = country || p.country || 'Pakistan';
  const profile = getCountryProfile(c);
  p.country = c;
  p.currency = profile.defaultCurrency;
  p.rateSchedule = profile.defaultRateSchedule;
  p.location = profile.defaultLocation;
  if (typeOverride && typeOverride[c]) {
    p.type = typeOverride[c];
  }
  return p;
}

function cloneWithNewId(base: Project, name: string, code: string): Project {
  const copy: Project = JSON.parse(JSON.stringify(base));
  copy.id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  copy.name = name;
  copy.code = code;
  copy.updatedAt = new Date().toISOString();
  copy.approvalStatus = 'Draft';
  return copy;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-2storey',
    name: '2-Storey Residential Building',
    type: '10-Marla Residential Villa',
    areaLabel: '223 m² / 2,400 sq.ft',
    summary: 'Complete 16-item residential BOQ with RCC, BBS steel, masonry, MEP, finishes & CPM schedule.',
    buildProject: (customName, country) => {
      const p = cloneWithNewId(
        SAMPLE_HOUSE_PROJECT,
        customName || '2-Storey Residential Building (New)',
        `CEP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`
      );
      return applyCountryMetadata(p, country, {
        Pakistan: '10-Marla Residential Villa',
        India: 'Independent Bungalow / Villa (G+1 / G+2)',
        UAE: 'G+1 Luxury Villa & Majlis',
        USA: 'Single-Family Custom Home (Slab-on-Grade)',
        UK: 'Detached / Semi-Detached Brick & Block Dwelling',
        EU: 'Single-Family Masonry / Timber Residence',
      });
    },
  },
  {
    id: 'tpl-5marla',
    name: '5-Marla / Compact Single-Family House',
    type: '5-Marla Residential House',
    areaLabel: '116 m² / 1,250 sq.ft',
    summary: 'Single-family compact urban house scaled to 1,250 sq.ft footprint with standard structural quantities.',
    buildProject: (customName, country) => {
      const p = cloneWithNewId(
        SAMPLE_HOUSE_PROJECT,
        customName || '5-Marla Modern Residence',
        `CEP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`
      );
      p.builtUpArea = 116;
      p.floors = 1;
      p.measurements = p.measurements.map((m) => ({
        ...m,
        no: m.no > 2 ? Math.max(1, Math.round(m.no * 0.55)) : m.no,
        length: m.length > 0 && m.no <= 2 ? Math.round(m.length * 0.6 * 100) / 100 : m.length,
      }));
      return applyCountryMetadata(p, country, {
        Pakistan: '5-Marla Residential House',
        India: 'Affordable Housing (PMAY) Block',
        UAE: 'G+1 Luxury Villa & Majlis',
        USA: 'Townhome / Subdivision Development',
        UK: 'Detached / Semi-Detached Brick & Block Dwelling',
        EU: 'Single-Family Masonry / Timber Residence',
      });
    },
  },
  {
    id: 'tpl-road-1km',
    name: '1 km Asphalt Arterial Road',
    type: 'NHA Asphalt Highway / Motorway',
    areaLabel: '7,300 m² / 78,576 sq.ft',
    summary: 'Subgrade preparation, granular sub-base, WBM base course, hot-mix asphalt, kerbstones & drainage.',
    buildProject: (customName, country) =>
      applyCountryMetadata(
        {
          id: `proj-${Date.now()}`,
          name: customName || '1.0 km Double-Lane Asphalt Road',
          code: `RD-${new Date().getFullYear()}-108`,
          client: 'Municipal Infrastructure Authority',
          country: country || 'Pakistan',
          location: 'Ring Road Sector 4 Corridor',
          type: 'NHA Asphalt Highway / Motorway',
          startDate: '2026-12-05',
          builtUpArea: 7300,
          floors: 1,
          currency: 'PKR',
          rateSchedule: 'NHA-CSR',
      taxPct: 5,
      overheadPct: 12,
      profitPct: 10,
      contingencyPct: 5,
      escalationPct: 2.5,
      approvalStatus: 'Draft',
      calendar: { workingDaysPerWeek: 6, holidays: [], weatherBufferDays: 5 },
      drawings: [],
      revisions: [],
      comments: [],
      updatedAt: new Date().toISOString(),
      boqItems: [
        {
          id: 'rd-subgrade',
          itemNo: '1.1',
          category: 'Earthwork',
          description: 'Clearing, grubbing & subgrade excavation/compaction to 98% MDD',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 180,
          crewSize: 2,
          dependencies: [],
          actualProgressPct: 0,
        },
        {
          id: 'rd-subbase',
          itemNo: '2.1',
          category: 'Roads',
          description: 'Granular Sub-Base (GSB) 200mm compacted thickness',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 140,
          crewSize: 2,
          dependencies: [{ predecessorId: 'rd-subgrade', type: 'FS', lagDays: 1 }],
          actualProgressPct: 0,
        },
        {
          id: 'rd-asphalt',
          itemNo: '3.1',
          category: 'Roads',
          description: 'Bituminous Hot-Mix Asphalt Wearing Course (75mm thick)',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 95,
          crewSize: 2,
          dependencies: [{ predecessorId: 'rd-subbase', type: 'FS', lagDays: 1 }],
          actualProgressPct: 0,
        },
        {
          id: 'rd-drain',
          itemNo: '4.1',
          category: 'Pipes',
          description: 'Precast RCC Roadside Storm Drain & Culvert Pipe (450mm dia)',
          unit: 'm',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 45,
          crewSize: 2,
          dependencies: [{ predecessorId: 'rd-subgrade', type: 'SS', lagDays: 3 }],
          actualProgressPct: 0,
        },
      ],
      measurements: [
        {
          id: 'rd-m1',
          boqItemId: 'rd-subgrade',
          srNo: '1',
          description: 'Carriageway + Shoulders Subgrade Cut (1000m x 8.5m x 0.35m)',
          no: 1,
          length: 1000,
          breadth: 8.5,
          height: 0.35,
          unit: 'm³',
          remarks: 'Chainage 0+000 to 1+000',
        },
        {
          id: 'rd-m2',
          boqItemId: 'rd-subbase',
          srNo: '2',
          description: 'GSB Layer (1000m x 7.8m x 0.20m)',
          no: 1,
          length: 1000,
          breadth: 7.8,
          height: 0.2,
          unit: 'm³',
          remarks: 'Compacted granular bed',
        },
        {
          id: 'rd-m3',
          boqItemId: 'rd-asphalt',
          srNo: '3',
          description: 'Asphalt Wearing Course (1000m x 7.3m x 0.075m)',
          no: 1,
          length: 1000,
          breadth: 7.3,
          height: 0.075,
          unit: 'm³',
          remarks: '7.3m dual lane carriageway',
        },
        {
          id: 'rd-m4',
          boqItemId: 'rd-drain',
          srNo: '4',
          description: 'Both Sides Storm Drain Lines',
          no: 2,
          length: 1000,
          breadth: 0,
          height: 0,
          unit: 'm',
          remarks: 'Left & Right shoulders',
        },
      ],
      rateAnalyses: [
        {
          id: 'ra-rd-1',
          boqItemId: 'rd-subgrade',
          baseQty: 10,
          outputUnit: 'm³',
          materials: [],
          labor: [
            { resourceId: 'lab-operator', quantity: 0.4 },
            { resourceId: 'lab-helper', quantity: 0.8 },
          ],
          equipment: [
            { resourceId: 'eq-excavator', quantity: 1.1 },
            { resourceId: 'eq-roller', quantity: 0.8 },
          ],
          wastagePct: 0,
          locationFactor: 1.0,
          escalationPct: 0,
        },
        {
          id: 'ra-rd-2',
          boqItemId: 'rd-subbase',
          baseQty: 1,
          outputUnit: 'm³',
          materials: [
            { resourceId: 'mat-agg', quantity: 0.9 },
            { resourceId: 'mat-sand', quantity: 0.35 },
          ],
          labor: [
            { resourceId: 'lab-operator', quantity: 0.08 },
            { resourceId: 'lab-helper', quantity: 0.25 },
          ],
          equipment: [{ resourceId: 'eq-roller', quantity: 0.25 }],
          wastagePct: 5,
          locationFactor: 1.0,
          escalationPct: 0,
        },
        {
          id: 'ra-rd-3',
          boqItemId: 'rd-asphalt',
          baseQty: 1,
          outputUnit: 'm³',
          materials: [{ resourceId: 'mat-asphalt', quantity: 1.0 }],
          labor: [
            { resourceId: 'lab-operator', quantity: 0.15 },
            { resourceId: 'lab-helper', quantity: 0.4 },
          ],
          equipment: [{ resourceId: 'eq-roller', quantity: 0.45 }],
          wastagePct: 3,
          locationFactor: 1.0,
          escalationPct: 0,
        },
        {
          id: 'ra-rd-4',
          boqItemId: 'rd-drain',
          baseQty: 10,
          outputUnit: 'm',
          materials: [
            { resourceId: 'mat-pipe', quantity: 10 },
            { resourceId: 'mat-cement', quantity: 2.0 },
          ],
          labor: [
            { resourceId: 'lab-mason', quantity: 1.2 },
            { resourceId: 'lab-helper', quantity: 1.8 },
          ],
          equipment: [{ resourceId: 'eq-excavator', quantity: 0.8 }],
          wastagePct: 3,
          locationFactor: 1.0,
          escalationPct: 0,
        },
      ],
        },
        country,
        {
          Pakistan: 'NHA Asphalt Highway / Motorway',
          India: 'NHAI Bituminous / Rigid Pavement Highway',
          UAE: 'Multi-Lane Urban Highway & Interchange',
          USA: 'DOT Asphalt Arterial / Highway Widening',
          UK: 'Carriageway Surfacing & Kerbing Works',
          EU: 'Regional Asphalt Road & Cycle Track',
        }
      ),
  },
  {
    id: 'tpl-boundary',
    name: '200m Boundary Wall & Gate',
    type: 'Boundary Wall, Security Gate & Guard Room',
    areaLabel: '200 m / 656 ft Perimeter',
    summary: 'Foundation excavation, PCC strip footing, brick masonry piers, coping, plaster & exterior paint.',
    buildProject: (customName, country) =>
      applyCountryMetadata(
        {
          id: `proj-${Date.now()}`,
          name: customName || '200m Industrial Perimeter Boundary Wall',
          code: `BW-${new Date().getFullYear()}-022`,
          client: 'Atlas Logistics Park',
          country: country || 'Pakistan',
          location: 'Zone C Industrial Estate',
          type: 'Boundary Wall, Security Gate & Guard Room',
          startDate: '2026-12-02',
          builtUpArea: 480,
          floors: 1,
          currency: 'PKR',
          rateSchedule: 'MRS-Market',
      taxPct: 5,
      overheadPct: 10,
      profitPct: 8,
      contingencyPct: 3,
      escalationPct: 0,
      approvalStatus: 'Draft',
      calendar: { workingDaysPerWeek: 6, holidays: [], weatherBufferDays: 2 },
      drawings: [],
      revisions: [],
      comments: [],
      updatedAt: new Date().toISOString(),
      boqItems: [
        {
          id: 'bw-exc',
          itemNo: '1.1',
          category: 'Earthwork',
          description: 'Strip trench excavation 0.75m wide x 0.9m deep',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 25,
          crewSize: 1,
          dependencies: [],
          actualProgressPct: 0,
        },
        {
          id: 'bw-pcc',
          itemNo: '2.1',
          category: 'PCC',
          description: 'PCC 1:4:8 strip footing bed (150mm thick)',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 10,
          crewSize: 1,
          dependencies: [{ predecessorId: 'bw-exc', type: 'FS', lagDays: 0 }],
          actualProgressPct: 0,
        },
        {
          id: 'bw-mas',
          itemNo: '3.1',
          category: 'Masonry',
          description: '230mm brick masonry wall with 345mm piers @ 3.0m c/c',
          unit: 'm³',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 5,
          crewSize: 2,
          dependencies: [{ predecessorId: 'bw-pcc', type: 'FS', lagDays: 0 }],
          actualProgressPct: 0,
        },
        {
          id: 'bw-pls',
          itemNo: '4.1',
          category: 'Plaster',
          description: '12mm cement plaster (1:4) on both wall faces',
          unit: 'm²',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 50,
          crewSize: 2,
          dependencies: [{ predecessorId: 'bw-mas', type: 'FS', lagDays: 1 }],
          actualProgressPct: 0,
        },
        {
          id: 'bw-pnt',
          itemNo: '5.1',
          category: 'Painting',
          description: 'Weatherproof exterior emulsion paint (2 coats)',
          unit: 'm²',
          useRateAnalysis: true,
          manualRate: 0,
          productivityPerDay: 75,
          crewSize: 2,
          dependencies: [{ predecessorId: 'bw-pls', type: 'FS', lagDays: 2 }],
          actualProgressPct: 0,
        },
      ],
      measurements: [
        {
          id: 'bw-m1',
          boqItemId: 'bw-exc',
          srNo: '1',
          description: 'Perimeter Wall Trench',
          no: 1,
          length: 200,
          breadth: 0.75,
          height: 0.9,
          unit: 'm³',
          remarks: '200m run',
        },
        {
          id: 'bw-m2',
          boqItemId: 'bw-pcc',
          srNo: '2',
          description: 'Strip Footing PCC',
          no: 1,
          length: 200,
          breadth: 0.75,
          height: 0.15,
          unit: 'm³',
          remarks: '150mm bed',
        },
        {
          id: 'bw-m3',
          boqItemId: 'bw-mas',
          srNo: '3',
          description: 'Brick Wall Superstructure (2.4m height)',
          no: 1,
          length: 200,
          breadth: 0.23,
          height: 2.4,
          unit: 'm³',
          remarks: 'Includes plinth + wall',
        },
        {
          id: 'bw-m4',
          boqItemId: 'bw-pls',
          srNo: '4',
          description: 'Plaster Both Sides',
          no: 2,
          length: 200,
          breadth: 2.4,
          height: 0,
          unit: 'm²',
          remarks: 'Front & back faces',
        },
        {
          id: 'bw-m5',
          boqItemId: 'bw-pnt',
          srNo: '5',
          description: 'Exterior Paint Both Sides',
          no: 2,
          length: 200,
          breadth: 2.4,
          height: 0,
          unit: 'm²',
          remarks: 'Matches plaster area',
        },
      ],
      rateAnalyses: [
        {
          id: 'ra-bw-1',
          boqItemId: 'bw-exc',
          baseQty: 10,
          outputUnit: 'm³',
          materials: [],
          labor: [{ resourceId: 'lab-helper', quantity: 1.5 }],
          equipment: [{ resourceId: 'eq-excavator', quantity: 1.0 }],
          wastagePct: 0,
          locationFactor: 1,
          escalationPct: 0,
        },
        {
          id: 'ra-bw-2',
          boqItemId: 'bw-pcc',
          baseQty: 1,
          outputUnit: 'm³',
          materials: [
            { resourceId: 'mat-cement', quantity: 3.4 },
            { resourceId: 'mat-sand', quantity: 0.48 },
            { resourceId: 'mat-agg', quantity: 0.96 },
          ],
          labor: [
            { resourceId: 'lab-mason', quantity: 0.2 },
            { resourceId: 'lab-helper', quantity: 1.0 },
          ],
          equipment: [{ resourceId: 'eq-mixer', quantity: 0.5 }],
          wastagePct: 2,
          locationFactor: 1,
          escalationPct: 0,
        },
        {
          id: 'ra-bw-3',
          boqItemId: 'bw-mas',
          baseQty: 1,
          outputUnit: 'm³',
          materials: [
            { resourceId: 'mat-brick', quantity: 500 },
            { resourceId: 'mat-cement', quantity: 1.4 },
            { resourceId: 'mat-sand', quantity: 0.26 },
          ],
          labor: [
            { resourceId: 'lab-mason', quantity: 0.85 },
            { resourceId: 'lab-helper', quantity: 1.3 },
          ],
          equipment: [],
          wastagePct: 3,
          locationFactor: 1,
          escalationPct: 0,
        },
        {
          id: 'ra-bw-4',
          boqItemId: 'bw-pls',
          baseQty: 10,
          outputUnit: 'm²',
          materials: [
            { resourceId: 'mat-cement', quantity: 1.2 },
            { resourceId: 'mat-sand', quantity: 0.16 },
          ],
          labor: [
            { resourceId: 'lab-mason', quantity: 0.8 },
            { resourceId: 'lab-helper', quantity: 0.9 },
          ],
          equipment: [],
          wastagePct: 5,
          locationFactor: 1,
          escalationPct: 0,
        },
        {
          id: 'ra-bw-5',
          boqItemId: 'bw-pnt',
          baseQty: 10,
          outputUnit: 'm²',
          materials: [{ resourceId: 'mat-paint', quantity: 2.2 }],
          labor: [
            { resourceId: 'lab-painter', quantity: 0.8 },
            { resourceId: 'lab-helper', quantity: 0.3 },
          ],
          equipment: [],
          wastagePct: 5,
          locationFactor: 1,
          escalationPct: 0,
        },
      ],
        },
        country,
        {
          Pakistan: 'Boundary Wall, Security Gate & Guard Room',
          India: 'Compound Wall & Industrial Gatehouse',
          UAE: 'Precast Boundary Wall & Security Gatehouse',
          USA: 'MSE / Cantilever Retaining Wall',
          UK: 'Brick / Acoustic Boundary Wall & Fencing',
          EU: 'Perimeter Retaining & Acoustic Wall',
        }
      ),
  },
];
