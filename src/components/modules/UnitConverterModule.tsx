import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  History,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { formatNum } from '../../engine/formatters';

type ConverterCategory =
  | 'length'
  | 'area'
  | 'volume'
  | 'mass'
  | 'construction'
  | 'rebar-concrete';

interface UnitDef {
  id: string;
  label: string;
  symbol: string;
  system: 'Metric' | 'Imperial / FPS' | 'Engineering';
  /** Factor to convert 1 unit of this type into the category base unit */
  toBase: number;
  note?: string;
}

interface ConstructionPair {
  id: string;
  label: string;
  fromLabel: string;
  fromUnit: string;
  toLabel: string;
  toUnit: string;
  /** 1 fromUnit = factor * toUnit */
  factor: number;
  formulaNote: string;
  defaultInput: number;
}

interface PresetItem {
  label: string;
  category: ConverterCategory;
  fromId: string;
  toId: string;
  value: number;
  pairId?: string;
}

interface ConversionHistoryEntry {
  id: string;
  summary: string;
  categoryLabel: string;
  timestamp: string;
}

const CATEGORIES: { id: ConverterCategory; label: string }[] = [
  { id: 'length', label: 'Length' },
  { id: 'area', label: 'Area' },
  { id: 'volume', label: 'Volume' },
  { id: 'mass', label: 'Mass & Force' },
  { id: 'construction', label: 'Construction Pairs' },
  { id: 'rebar-concrete', label: 'Rebar & Concrete Mix' },
];

// Base units: Length -> meter (m), Area -> sq.meter (m²), Volume -> cu.meter (m³), Mass -> kilogram (kg)
const STANDARD_UNITS: Record<'length' | 'area' | 'volume' | 'mass', UnitDef[]> = {
  length: [
    { id: 'mm', label: 'Millimeter', symbol: 'mm', system: 'Metric', toBase: 0.001 },
    { id: 'cm', label: 'Centimeter', symbol: 'cm', system: 'Metric', toBase: 0.01 },
    { id: 'm', label: 'Meter', symbol: 'm', system: 'Metric', toBase: 1 },
    { id: 'km', label: 'Kilometer', symbol: 'km', system: 'Metric', toBase: 1000 },
    { id: 'in', label: 'Inch', symbol: 'in', system: 'Imperial / FPS', toBase: 0.0254 },
    { id: 'ft', label: 'Foot', symbol: 'ft', system: 'Imperial / FPS', toBase: 0.3048 },
    { id: 'yd', label: 'Yard', symbol: 'yd', system: 'Imperial / FPS', toBase: 0.9144 },
    { id: 'mi', label: 'Mile', symbol: 'mi', system: 'Imperial / FPS', toBase: 1609.344 },
    { id: 'suttar', label: 'Suttar (1/8 in)', symbol: 'suttar', system: 'Engineering', toBase: 0.003175, note: 'Common field bar/pipe fraction' },
  ],
  area: [
    { id: 'mm2', label: 'Sq. Millimeter', symbol: 'mm²', system: 'Metric', toBase: 1e-6 },
    { id: 'cm2', label: 'Sq. Centimeter', symbol: 'cm²', system: 'Metric', toBase: 1e-4 },
    { id: 'm2', label: 'Sq. Meter', symbol: 'm²', system: 'Metric', toBase: 1 },
    { id: 'ha', label: 'Hectare', symbol: 'ha', system: 'Metric', toBase: 10000 },
    { id: 'km2', label: 'Sq. Kilometer', symbol: 'km²', system: 'Metric', toBase: 1e6 },
    { id: 'sqin', label: 'Sq. Inch', symbol: 'sq.in', system: 'Imperial / FPS', toBase: 0.00064516 },
    { id: 'sqft', label: 'Sq. Foot', symbol: 'sq.ft', system: 'Imperial / FPS', toBase: 0.09290304 },
    { id: 'sqyd', label: 'Sq. Yard (Gaj)', symbol: 'sq.yd', system: 'Imperial / FPS', toBase: 0.83612736 },
    { id: 'marla272', label: 'Marla (Standard 272.25 sq.ft)', symbol: 'marla', system: 'Engineering', toBase: 25.29285264, note: 'Revenue / DHA / Bahria plot unit' },
    { id: 'marla225', label: 'Marla (Lahore 225 sq.ft)', symbol: 'marla-LHR', system: 'Engineering', toBase: 20.903184, note: 'Urban LDA residential grid' },
    { id: 'kanal', label: 'Kanal (20 Std Marla)', symbol: 'kanal', system: 'Engineering', toBase: 505.8570528, note: '5,445 sq.ft' },
    { id: 'acre', label: 'Acre (8 Kanal)', symbol: 'acre', system: 'Imperial / FPS', toBase: 4046.8564224, note: '43,560 sq.ft' },
  ],
  volume: [
    { id: 'cm3', label: 'Cubic Centimeter', symbol: 'cm³', system: 'Metric', toBase: 1e-6 },
    { id: 'l', label: 'Liter', symbol: 'L', system: 'Metric', toBase: 0.001 },
    { id: 'm3', label: 'Cubic Meter', symbol: 'm³', system: 'Metric', toBase: 1 },
    { id: 'cuin', label: 'Cubic Inch', symbol: 'cu.in', system: 'Imperial / FPS', toBase: 1.6387064e-5 },
    { id: 'cft', label: 'Cubic Foot (CFT)', symbol: 'CFT', system: 'Imperial / FPS', toBase: 0.0283168466 },
    { id: 'cuyd', label: 'Cubic Yard', symbol: 'cu.yd', system: 'Imperial / FPS', toBase: 0.764554858 },
    { id: 'brass', label: 'Brass (100 CFT)', symbol: 'brass', system: 'Engineering', toBase: 2.83168466, note: 'Standard aggregate / sand / masonry bulk unit' },
    { id: 'usgal', label: 'US Gallon', symbol: 'gal (US)', system: 'Imperial / FPS', toBase: 0.0037854118 },
    { id: 'ukgal', label: 'Imperial Gallon', symbol: 'gal (UK)', system: 'Imperial / FPS', toBase: 0.00454609 },
  ],
  mass: [
    { id: 'g', label: 'Gram', symbol: 'g', system: 'Metric', toBase: 0.001 },
    { id: 'kg', label: 'Kilogram', symbol: 'kg', system: 'Metric', toBase: 1 },
    { id: 'quintal', label: 'Quintal (100 kg)', symbol: 'qtl', system: 'Metric', toBase: 100 },
    { id: 'ton', label: 'Metric Ton (Tonne)', symbol: 'MT', system: 'Metric', toBase: 1000 },
    { id: 'lb', label: 'Pound', symbol: 'lb', system: 'Imperial / FPS', toBase: 0.45359237 },
    { id: 'shortton', label: 'US Short Ton (2,000 lb)', symbol: 'ton (US)', system: 'Imperial / FPS', toBase: 907.18474 },
    { id: 'longton', label: 'Imperial Long Ton (2,240 lb)', symbol: 'ton (UK)', system: 'Imperial / FPS', toBase: 1016.04691 },
    { id: 'kn_earth', label: 'Kilonewton-mass equiv. (g=9.80665)', symbol: 'kN (wt)', system: 'Engineering', toBase: 101.971621, note: '1 kN ≈ 101.97 kgf' },
  ],
};

const CONSTRUCTION_PAIRS: ConstructionPair[] = [
  {
    id: 'm3-cement-bags-124',
    label: 'Concrete (m³) → Cement Bags (1:2:4 Nominal Mix)',
    fromLabel: 'Concrete Volume (1:2:4)',
    fromUnit: 'm³',
    toLabel: '50 kg Cement Bags',
    toUnit: 'bags',
    factor: 6.34,
    formulaNote: 'Dry vol = 1.54× wet · 1/7 share × 1,440 kg/m³ ÷ 50 kg ≈ 6.34 bags/m³',
    defaultInput: 10,
  },
  {
    id: 'm3-cement-bags-1153',
    label: 'Concrete (m³) → Cement Bags (1:1.5:3 M20 Structural)',
    fromLabel: 'Concrete Volume (1:1.5:3)',
    fromUnit: 'm³',
    toLabel: '50 kg Cement Bags',
    toUnit: 'bags',
    factor: 8.06,
    formulaNote: 'Dry vol = 1.54× wet · 1/5.5 share × 1,440 kg/m³ ÷ 50 kg ≈ 8.06 bags/m³',
    defaultInput: 10,
  },
  {
    id: 'm3-neat-cement-bags',
    label: 'Bulk Cement (m³) → 50 kg Cement Bags',
    fromLabel: 'Neat Cement Volume',
    fromUnit: 'm³',
    toLabel: '50 kg Cement Bags',
    toUnit: 'bags',
    factor: 28.8,
    formulaNote: 'Cement bulk density 1,440 kg/m³ ÷ 50 kg/bag = 28.8 bags/m³ (1 bag ≈ 1.25 CFT)',
    defaultInput: 1,
  },
  {
    id: 'cft-cement-bags',
    label: 'Cement Volume (CFT) → 50 kg Cement Bags',
    fromLabel: 'Cement Volume',
    fromUnit: 'CFT',
    toLabel: '50 kg Cement Bags',
    toUnit: 'bags',
    factor: 0.8,
    formulaNote: '1 standard 50 kg bag occupies 1.25 CFT (0.0347 m³) → 0.80 bags/CFT',
    defaultInput: 100,
  },
  {
    id: 'ton-kg',
    label: 'Metric Tons (MT) ↔ Kilograms (kg)',
    fromLabel: 'Metric Tons',
    fromUnit: 'MT',
    toLabel: 'Kilograms',
    toUnit: 'kg',
    factor: 1000,
    formulaNote: '1 Metric Ton = 1,000 kg (2,204.62 lb)',
    defaultInput: 5,
  },
  {
    id: 'm3-bricks',
    label: 'Brick Masonry (m³) ↔ Standard Bricks',
    fromLabel: 'Brickwork Volume',
    fromUnit: 'm³',
    toLabel: 'Modular Bricks',
    toUnit: 'nos',
    factor: 500,
    formulaNote: 'Standard 190×90×90mm brick with 10mm mortar joint = 500 bricks/m³ (13.5 bricks/CFT)',
    defaultInput: 12,
  },
  {
    id: 'brass-ton-agg',
    label: 'Aggregate / Crush (Brass, 100 CFT) ↔ Metric Tons',
    fromLabel: 'Coarse Aggregate (Brass)',
    fromUnit: 'brass',
    toLabel: 'Weight (Metric Tons)',
    toUnit: 'MT',
    factor: 4.53,
    formulaNote: '1 Brass = 2.8317 m³ × 1.60 MT/m³ loose bulk density ≈ 4.53 MT',
    defaultInput: 4,
  },
  {
    id: 'mpa-psi',
    label: 'Concrete Strength MPa (N/mm²) ↔ PSI',
    fromLabel: 'Compressive Strength',
    fromUnit: 'MPa',
    toLabel: 'Strength (lb/sq.in)',
    toUnit: 'psi',
    factor: 145.0377,
    formulaNote: '1 MPa = 1 N/mm² = 145.038 psi (e.g., 21 MPa ≈ 3,000 psi)',
    defaultInput: 21,
  },
  {
    id: 'kgm3-pcf',
    label: 'Material Density (kg/m³) ↔ lb/ft³ (PCF)',
    fromLabel: 'Metric Density',
    fromUnit: 'kg/m³',
    toLabel: 'Imperial Density',
    toUnit: 'lb/ft³',
    factor: 0.06242796,
    formulaNote: 'RCC = 2,400 kg/m³ ≈ 149.8 lb/ft³ · Steel = 7,850 kg/m³ ≈ 490 lb/ft³',
    defaultInput: 2400,
  },
];

const QUICK_PRESETS: PresetItem[] = [
  { label: '1 m³ Concrete (1:2:4) → Bags', category: 'construction', fromId: 'm3', toId: 'bags', value: 1, pairId: 'm3-cement-bags-124' },
  { label: '1 Metric Ton → Kilograms', category: 'mass', fromId: 'ton', toId: 'kg', value: 1 },
  { label: '1 m³ → Cubic Feet (CFT)', category: 'volume', fromId: 'm3', toId: 'cft', value: 1 },
  { label: '1,000 sq.ft → Sq. Meters', category: 'area', fromId: 'sqft', toId: 'm2', value: 1000 },
  { label: '1 Kanal → Sq. Feet', category: 'area', fromId: 'kanal', toId: 'sqft', value: 1 },
  { label: '1 Brass (100 CFT) → m³', category: 'volume', fromId: 'brass', toId: 'm3', value: 1 },
  { label: '21 MPa → PSI (Concrete)', category: 'construction', fromId: 'mpa', toId: 'psi', value: 21, pairId: 'mpa-psi' },
  { label: '100 ft → Meters', category: 'length', fromId: 'ft', toId: 'm', value: 100 },
];

const REBAR_DIAMETERS = [
  { label: '6 mm (#2)', mm: 6 },
  { label: '8 mm', mm: 8 },
  { label: '10 mm (#3)', mm: 10 },
  { label: '12 mm (#4)', mm: 12 },
  { label: '16 mm (#5)', mm: 16 },
  { label: '20 mm (#6)', mm: 20 },
  { label: '25 mm (#8)', mm: 25 },
  { label: '32 mm (#10)', mm: 32 },
];

const MIX_RATIOS = [
  { id: '1:1.5:3', label: '1 : 1.5 : 3 (M20 / ~3,000 PSI RCC)', c: 1, s: 1.5, a: 3 },
  { id: '1:2:4', label: '1 : 2 : 4 (M15 / PCC & Light RCC)', c: 1, s: 2, a: 4 },
  { id: '1:3:6', label: '1 : 3 : 6 (Lean Concrete / Sub-base)', c: 1, s: 3, a: 6 },
  { id: '1:4:8', label: '1 : 4 : 8 (Blinding / Foundation Bed)', c: 1, s: 4, a: 8 },
];

export const UnitConverterModule: React.FC = () => {
  const { project, unitSystem } = useActiveProject();

  const [category, setCategory] = useState<ConverterCategory>('length');
  const [inputValueStr, setInputValueStr] = useState<string>('100');
  const [precision, setPrecision] = useState<number>(3);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Per-category selected from/to units
  const [fromUnitByCat, setFromUnitByCat] = useState<Record<'length' | 'area' | 'volume' | 'mass', string>>({
    length: unitSystem === 'imperial' ? 'ft' : 'm',
    area: unitSystem === 'imperial' ? 'sqft' : 'm2',
    volume: unitSystem === 'imperial' ? 'cft' : 'm3',
    mass: 'ton',
  });
  const [toUnitByCat, setToUnitByCat] = useState<Record<'length' | 'area' | 'volume' | 'mass', string>>({
    length: unitSystem === 'imperial' ? 'm' : 'ft',
    area: unitSystem === 'imperial' ? 'm2' : 'sqft',
    volume: unitSystem === 'imperial' ? 'm3' : 'cft',
    mass: 'kg',
  });

  // Construction Pairs state
  const [selectedPairId, setSelectedPairId] = useState<string>(CONSTRUCTION_PAIRS[0].id);
  const [pairReversed, setPairReversed] = useState<boolean>(false);

  // Rebar & Concrete Mix quick calculator state
  const [rebarDiaMm, setRebarDiaMm] = useState<number>(12);
  const [rebarLengthVal, setRebarLengthVal] = useState<number>(100);
  const [rebarLengthUnit, setRebarLengthUnit] = useState<'m' | 'ft'>(
    unitSystem === 'imperial' ? 'ft' : 'm'
  );
  const [mixId, setMixId] = useState<string>('1:2:4');
  const [mixVolume, setMixVolume] = useState<number>(10);
  const [mixVolumeUnit, setMixVolumeUnit] = useState<'m3' | 'cft'>(
    unitSystem === 'imperial' ? 'cft' : 'm3'
  );

  // Recent history
  const [history, setHistory] = useState<ConversionHistoryEntry[]>([]);

  const numericInput = useMemo(() => {
    const parsed = parseFloat(inputValueStr);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [inputValueStr]);

  const activeStdCategory =
    category === 'length' || category === 'area' || category === 'volume' || category === 'mass'
      ? category
      : null;

  const currentUnits = activeStdCategory ? STANDARD_UNITS[activeStdCategory] : [];
  const fromUnit = activeStdCategory
    ? currentUnits.find((u) => u.id === fromUnitByCat[activeStdCategory]) || currentUnits[0]
    : null;
  const toUnit = activeStdCategory
    ? currentUnits.find((u) => u.id === toUnitByCat[activeStdCategory]) || currentUnits[1]
    : null;

  const convertedStdValue = useMemo(() => {
    if (!fromUnit || !toUnit) return 0;
    const baseVal = numericInput * fromUnit.toBase;
    return baseVal / toUnit.toBase;
  }, [numericInput, fromUnit, toUnit]);

  const activePair =
    CONSTRUCTION_PAIRS.find((p) => p.id === selectedPairId) || CONSTRUCTION_PAIRS[0];

  const convertedPairValue = useMemo(() => {
    return pairReversed ? numericInput / activePair.factor : numericInput * activePair.factor;
  }, [numericInput, activePair, pairReversed]);

  // Rebar calculations
  const rebarMetrics = useMemo(() => {
    const lengthMeters = rebarLengthUnit === 'ft' ? rebarLengthVal * 0.3048 : rebarLengthVal;
    const unitWeightKgPerM = (rebarDiaMm * rebarDiaMm) / 162.2;
    const totalKg = unitWeightKgPerM * lengthMeters;
    const totalLb = totalKg * 2.20462262;
    const totalTons = totalKg / 1000;
    const standard12mBars = lengthMeters / 12;
    const standard40ftBars = (lengthMeters * 3.28084) / 40;
    return { unitWeightKgPerM, totalKg, totalLb, totalTons, standard12mBars, standard40ftBars };
  }, [rebarDiaMm, rebarLengthVal, rebarLengthUnit]);

  // Concrete Mix calculations
  const concreteMixMetrics = useMemo(() => {
    const ratio = MIX_RATIOS.find((m) => m.id === mixId) || MIX_RATIOS[1];
    const wetM3 = mixVolumeUnit === 'cft' ? mixVolume * 0.0283168466 : mixVolume;
    const dryM3 = wetM3 * 1.54;
    const sumParts = ratio.c + ratio.s + ratio.a;
    const cementM3 = (ratio.c / sumParts) * dryM3;
    const cementKg = cementM3 * 1440;
    const cementBags = cementKg / 50;
    const sandM3 = (ratio.s / sumParts) * dryM3;
    const aggM3 = (ratio.a / sumParts) * dryM3;
    return {
      wetM3,
      dryM3,
      cementBags,
      cementKg,
      sandM3,
      sandCft: sandM3 * 35.31467,
      aggM3,
      aggCft: aggM3 * 35.31467,
      waterLiters: cementKg * 0.48,
    };
  }, [mixId, mixVolume, mixVolumeUnit]);

  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  const logHistory = () => {
    let summary = '';
    const catLabel = CATEGORIES.find((c) => c.id === category)?.label || '';
    if (activeStdCategory && fromUnit && toUnit) {
      summary = `${formatNum(numericInput, precision)} ${fromUnit.symbol} = ${formatNum(convertedStdValue, precision)} ${toUnit.symbol}`;
    } else if (category === 'construction') {
      const fU = pairReversed ? activePair.toUnit : activePair.fromUnit;
      const tU = pairReversed ? activePair.fromUnit : activePair.toUnit;
      summary = `${formatNum(numericInput, precision)} ${fU} = ${formatNum(convertedPairValue, precision)} ${tU}`;
    }
    if (!summary) return;
    setHistory((prev) => [
      {
        id: `hist-${Date.now()}`,
        summary,
        categoryLabel: catLabel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      ...prev.slice(0, 11),
    ]);
  };

  const handleSwapUnits = () => {
    if (activeStdCategory && fromUnit && toUnit) {
      setFromUnitByCat((prev) => ({ ...prev, [activeStdCategory]: toUnit.id }));
      setToUnitByCat((prev) => ({ ...prev, [activeStdCategory]: fromUnit.id }));
    } else if (category === 'construction') {
      setPairReversed((r) => !r);
    }
  };

  const applyPreset = (preset: PresetItem) => {
    setCategory(preset.category);
    setInputValueStr(String(preset.value));
    if (preset.category === 'construction' && preset.pairId) {
      setSelectedPairId(preset.pairId);
      setPairReversed(false);
    } else if (
      preset.category === 'length' ||
      preset.category === 'area' ||
      preset.category === 'volume' ||
      preset.category === 'mass'
    ) {
      const cat = preset.category;
      setFromUnitByCat((prev) => ({ ...prev, [cat]: preset.fromId }));
      setToUnitByCat((prev) => ({ ...prev, [cat]: preset.toId }));
    }
  };

  const flipMetricImperialPair = () => {
    if (!activeStdCategory || !fromUnit || !toUnit) return;
    if (activeStdCategory === 'length') {
      setFromUnitByCat((p) => ({ ...p, length: fromUnit.id === 'm' ? 'ft' : 'm' }));
      setToUnitByCat((p) => ({ ...p, length: fromUnit.id === 'm' ? 'm' : 'ft' }));
    } else if (activeStdCategory === 'area') {
      setFromUnitByCat((p) => ({ ...p, area: fromUnit.id === 'm2' ? 'sqft' : 'm2' }));
      setToUnitByCat((p) => ({ ...p, area: fromUnit.id === 'm2' ? 'm2' : 'sqft' }));
    } else if (activeStdCategory === 'volume') {
      setFromUnitByCat((p) => ({ ...p, volume: fromUnit.id === 'm3' ? 'cft' : 'm3' }));
      setToUnitByCat((p) => ({ ...p, volume: fromUnit.id === 'm3' ? 'm3' : 'cft' }));
    } else if (activeStdCategory === 'mass') {
      setFromUnitByCat((p) => ({ ...p, mass: fromUnit.id === 'kg' ? 'lb' : 'kg' }));
      setToUnitByCat((p) => ({ ...p, mass: fromUnit.id === 'kg' ? 'kg' : 'lb' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Engineering Toolbox</span>
            <span aria-hidden="true">·</span>
            <span>Metric SI & FPS Imperial</span>
            <span aria-hidden="true">·</span>
            <span>Project Default: {project.rateSchedule}</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Unit Conversion Utility
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Instant engineering conversions across length, area, volume, mass, cement bags, rebar weights, and concrete mixes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5">
            <span className="text-slate-500">Decimals:</span>
            {[2, 3, 4, 6].map((dec) => (
              <button
                key={dec}
                type="button"
                onClick={() => setPrecision(dec)}
                className={`px-2 py-0.5 rounded font-mono text-xs transition-colors ${
                  precision === dec
                    ? 'bg-[#0F2137] text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {dec}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setInputValueStr('1');
              setPairReversed(false);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to 1</span>
          </button>
        </div>
      </div>

      {/* Category Segmented Bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit max-w-full overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              category === cat.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main 12-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main Converter Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          {activeStdCategory && fromUnit && toUnit && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {CATEGORIES.find((c) => c.id === activeStdCategory)?.label} Converter
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    1 {fromUnit.symbol} = {formatNum(fromUnit.toBase / toUnit.toBase, precision)}{' '}
                    {toUnit.symbol}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={flipMetricImperialPair}
                    className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Quick Metric ↔ FPS
                  </button>
                  <button
                    type="button"
                    onClick={logHistory}
                    className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Save to Log
                  </button>
                </div>
              </div>

              {/* From -> Swap -> To Grid */}
              <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-end">
                <div className="md:col-span-5 space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-500">From Value & Unit</label>
                  <input
                    type="number"
                    step="any"
                    value={inputValueStr}
                    onChange={(e) => setInputValueStr(e.target.value)}
                    className="w-full px-3 py-2.5 text-lg font-mono font-bold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <select
                    value={fromUnit.id}
                    onChange={(e) =>
                      setFromUnitByCat((prev) => ({
                        ...prev,
                        [activeStdCategory]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {currentUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label} ({u.symbol}) · {u.system}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1 flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={handleSwapUnits}
                    aria-label="Swap units"
                    title="Swap From and To units"
                    className="p-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-500/50 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-500">Converted Result</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={formatNum(convertedStdValue, precision)}
                      className="w-full pl-3 pr-10 py-2.5 text-lg font-mono font-bold tabular-nums bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 rounded-md text-orange-700 dark:text-orange-300"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `${formatNum(convertedStdValue, precision)} ${toUnit.symbol}`,
                          'main-std'
                        )
                      }
                      aria-label="Copy converted value"
                      className="absolute right-2 p-1.5 rounded text-slate-500 hover:text-orange-600"
                    >
                      {copiedId === 'main-std' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <select
                    value={toUnit.id}
                    onChange={(e) =>
                      setToUnitByCat((prev) => ({
                        ...prev,
                        [activeStdCategory]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  >
                    {currentUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label} ({u.symbol}) · {u.system}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* All Equivalents Table */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    All Equivalent {CATEGORIES.find((c) => c.id === activeStdCategory)?.label} Units
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Click any row to set as Target unit
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                        <th className="py-2 pr-3 font-medium">Unit</th>
                        <th className="py-2 px-3 font-medium">System</th>
                        <th className="py-2 px-3 font-medium text-right">Equivalent Value</th>
                        <th className="py-2 pl-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {currentUnits.map((u) => {
                        const eqVal = (numericInput * fromUnit.toBase) / u.toBase;
                        const isTarget = u.id === toUnit.id;
                        return (
                          <tr
                            key={u.id}
                            onClick={() =>
                              setToUnitByCat((prev) => ({ ...prev, [activeStdCategory]: u.id }))
                            }
                            className={`cursor-pointer transition-colors ${
                              isTarget
                                ? 'bg-orange-50/50 dark:bg-orange-950/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="py-2 pr-3">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {u.label}{' '}
                                <span className="font-mono text-slate-500">({u.symbol})</span>
                              </div>
                              {u.note && (
                                <div className="text-[10px] text-slate-400">{u.note}</div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                              {u.system}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {formatNum(eqVal, precision)}
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(`${formatNum(eqVal, precision)} ${u.symbol}`, `row-${u.id}`);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-500 hover:text-orange-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {copiedId === `row-${u.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Construction Pairs Interactive Converter */}
          {category === 'construction' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Construction Unit Pair Converter
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Concrete to cement bags, metric tons to kilograms, masonry to bricks, brass & concrete strength.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logHistory}
                  className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Save to Log
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-slate-500">
                  Select Construction Conversion Pair
                </label>
                <select
                  value={activePair.id}
                  onChange={(e) => {
                    const nextPair = CONSTRUCTION_PAIRS.find((p) => p.id === e.target.value);
                    setSelectedPairId(e.target.value);
                    setPairReversed(false);
                    if (nextPair) setInputValueStr(String(nextPair.defaultInput));
                  }}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                >
                  {CONSTRUCTION_PAIRS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-end">
                <div className="md:col-span-5 space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    {pairReversed ? activePair.toLabel : activePair.fromLabel} (
                    {pairReversed ? activePair.toUnit : activePair.fromUnit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={inputValueStr}
                    onChange={(e) => setInputValueStr(e.target.value)}
                    className="w-full px-3 py-2.5 text-lg font-mono font-bold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white"
                  />
                </div>

                <div className="md:col-span-1 flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={handleSwapUnits}
                    aria-label="Reverse construction pair"
                    className="p-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-orange-500/50 text-slate-700 dark:text-slate-200"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="md:col-span-5 space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    {pairReversed ? activePair.fromLabel : activePair.toLabel} (
                    {pairReversed ? activePair.fromUnit : activePair.toUnit})
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={formatNum(convertedPairValue, precision)}
                      className="w-full pl-3 pr-10 py-2.5 text-lg font-mono font-bold tabular-nums bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 rounded-md text-orange-700 dark:text-orange-300"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `${formatNum(convertedPairValue, precision)} ${
                            pairReversed ? activePair.fromUnit : activePair.toUnit
                          }`,
                          'pair-main'
                        )
                      }
                      className="absolute right-2 p-1.5 rounded text-slate-500 hover:text-orange-600"
                    >
                      {copiedId === 'pair-main' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 py-2.5 px-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="font-semibold text-slate-900 dark:text-white">Engineering Basis: </span>
                {activePair.formulaNote}
              </div>

              {/* Reference table of all construction pairs */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  All Construction Unit Pairs (Click to Load)
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {CONSTRUCTION_PAIRS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPairId(p.id);
                        setPairReversed(false);
                        setInputValueStr(String(p.defaultInput));
                      }}
                      className={`w-full text-left py-2.5 px-2 flex items-center justify-between gap-3 transition-colors ${
                        p.id === activePair.id
                          ? 'bg-orange-50/50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{p.label}</div>
                        <div className="text-[11px] text-slate-500">{p.formulaNote}</div>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                        1 {p.fromUnit} = {formatNum(p.factor, 2)} {p.toUnit}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Rebar Weight & Concrete Mix Calculators */}
          {category === 'rebar-concrete' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Steel Rebar Weight & Length Converter (d² / 162.2)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Convert bar length in meters or feet into kilograms, pounds, metric tons, and 12 m / 40 ft mill bars.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Bar Diameter</label>
                    <select
                      value={rebarDiaMm}
                      onChange={(e) => setRebarDiaMm(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      {REBAR_DIAMETERS.map((d) => (
                        <option key={d.mm} value={d.mm}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Total Bar Length</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={rebarLengthVal}
                      onChange={(e) => setRebarLengthVal(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Length Unit</label>
                    <select
                      value={rebarLengthUnit}
                      onChange={(e) => setRebarLengthUnit(e.target.value as 'm' | 'ft')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      <option value="m">Meters (m)</option>
                      <option value="ft">Feet (ft)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Total Weight (kg)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(rebarMetrics.totalKg, 2)} kg
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Total Weight (lb)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(rebarMetrics.totalLb, 1)} lb
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Metric Tons</div>
                    <div className="text-base font-mono font-bold tabular-nums text-orange-600 dark:text-orange-400 mt-0.5">
                      {formatNum(rebarMetrics.totalTons, 3)} MT
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Standard Mill Bars</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(rebarMetrics.standard40ftBars, 1)} × 40ft
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {formatNum(rebarMetrics.standard12mBars, 1)} × 12m
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Concrete Volume to Cement Bags, Sand & Aggregate
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Includes 1.54× dry-volume bulking factor and 50 kg cement bags (1,440 kg/m³).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Concrete Grade / Mix</label>
                    <select
                      value={mixId}
                      onChange={(e) => setMixId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      {MIX_RATIOS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Wet Concrete Volume</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={mixVolume}
                      onChange={(e) => setMixVolume(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Volume Unit</label>
                    <select
                      value={mixVolumeUnit}
                      onChange={(e) => setMixVolumeUnit(e.target.value as 'm3' | 'cft')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      <option value="m3">Cubic Meters (m³)</option>
                      <option value="cft">Cubic Feet (CFT)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div className="p-3 rounded-md bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40">
                    <div className="text-[11px] text-slate-500">Cement (50 kg Bags)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-orange-700 dark:text-orange-300 mt-0.5">
                      {formatNum(concreteMixMetrics.cementBags, 1)} bags
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {formatNum(concreteMixMetrics.cementKg, 0)} kg
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Fine Aggregate (Sand)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(concreteMixMetrics.sandCft, 1)} CFT
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {formatNum(concreteMixMetrics.sandM3, 2)} m³
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Coarse Aggregate (Crush)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(concreteMixMetrics.aggCft, 1)} CFT
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {formatNum(concreteMixMetrics.aggM3, 2)} m³
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500">Water (w/c ≈ 0.48)</div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatNum(concreteMixMetrics.waterLiters, 0)} L
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Dry Vol: {formatNum(concreteMixMetrics.dryM3, 2)} m³
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Presets, History & Quick Reference */}
        <div className="lg:col-span-5 space-y-5">
          {/* Quick Presets */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              One-Click Civil Engineering Presets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Load frequent BOQ & site material conversions immediately.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="text-left px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 hover:border-orange-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Log / History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-orange-600" />
                <span>Saved Conversion Log ({history.length})</span>
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
                Click <strong className="text-slate-700 dark:text-slate-200">Save to Log</strong> to pin conversions for BOQ entry or site verification.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                        {item.summary}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.categoryLabel} · {item.timestamp}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.summary, item.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-orange-600 shrink-0"
                      aria-label="Copy logged conversion"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Standard Civil Reference Factors */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Standard Civil Reference Constants
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {[
                ['1 Meter (m)', '3.28084 ft · 39.3701 in'],
                ['1 Sq. Meter (m²)', '10.76391 sq.ft · 1.19599 sq.yd'],
                ['1 Cubic Meter (m³)', '35.31467 CFT · 1.30795 cu.yd'],
                ['1 Brass (Sand/Crush)', '100 CFT · 2.83168 m³'],
                ['1 Marla (Std / Lahore)', '272.25 sq.ft / 225 sq.ft'],
                ['1 Cement Bag (50 kg)', '1.25 CFT · 0.0347 m³'],
                ['1 Metric Ton (MT)', '1,000 kg · 2,204.62 lb'],
                ['Steel Unit Density', '7,850 kg/m³ · 490 lb/ft³'],
              ].map(([k, v]) => (
                <div key={k} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-300">{k}</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums text-right">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
