import { CountryCode, CurrencyCode, RateScheduleType, UnitSystem } from '../types/estimate';

export interface ProjectTypeGroup {
  group: string;
  types: string[];
}

export interface CountryProfile {
  code: CountryCode;
  label: string;
  defaultCurrency: CurrencyCode;
  defaultUnitSystem: UnitSystem;
  defaultRateSchedule: RateScheduleType;
  defaultLocation: string;
  rateSchedules: RateScheduleType[];
  projectTypeGroups: ProjectTypeGroup[];
}

export const COUNTRY_LIST: CountryCode[] = [
  'Pakistan',
  'India',
  'UAE',
  'USA',
  'UK',
  'EU',
];

export const COUNTRY_CATALOG: Record<CountryCode, CountryProfile> = {
  Pakistan: {
    code: 'Pakistan',
    label: 'Pakistan',
    defaultCurrency: 'PKR',
    defaultUnitSystem: 'imperial',
    defaultRateSchedule: 'MRS-Market',
    defaultLocation: 'DHA Phase 6, Lahore',
    rateSchedules: ['MRS-Market', 'MRS-Punjab', 'NHA-CSR', 'MES-Schedule', 'SOR-2026', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Residential & Housing (Marla / Kanal)',
        types: [
          '5-Marla Residential House',
          '10-Marla Residential Villa',
          '1-Kanal Bungalow',
          '2-Kanal / 4-Kanal Farmhouse',
          'Low-Cost Housing Unit',
          'Housing Society Apartment Block',
        ],
      },
      {
        group: 'Commercial, Institutional & Industrial',
        types: [
          'Commercial Plaza (DHA / LDA)',
          'High-Rise Mixed-Use Tower',
          'School / College Academic Block',
          'Hospital / BHU Health Facility',
          'Mosque / Community Center',
          'Industrial Shed & Warehouse',
        ],
      },
      {
        group: 'Roads, Highways & Bridges (NHA / C&W)',
        types: [
          'NHA Asphalt Highway / Motorway',
          'Farm-to-Market Carpeted Road',
          'Urban Dual Carriageway & Flyover',
          'RCC Box Culvert & Minor Bridge',
          'Prestressed Girder Bridge',
          'Retaining Wall & Slope Protection',
        ],
      },
      {
        group: 'Irrigation, Water Supply & Society Works',
        types: [
          'Lined Irrigation Canal & Watercourse',
          'Tube Well & Overhead Water Tank (OHWT)',
          'Underground Water Tank (UGWT) & Pump House',
          'Sewerage Trunk Line & Oxidation Pond',
          'Stormwater Drain & Culvert Network',
          'Boundary Wall, Security Gate & Guard Room',
        ],
      },
    ],
  },

  India: {
    code: 'India',
    label: 'India',
    defaultCurrency: 'INR',
    defaultUnitSystem: 'metric',
    defaultRateSchedule: 'CPWD-DSR',
    defaultLocation: 'Sector 62, Noida / NCR',
    rateSchedules: ['CPWD-DSR', 'PWD-SSR', 'SOR-2026', 'MRS-Market', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Residential & Real Estate',
        types: [
          'Independent Bungalow / Villa (G+1 / G+2)',
          'G+4 Stilt + Parking Apartment',
          'High-Rise Residential Tower (Shear Wall)',
          'Affordable Housing (PMAY) Block',
          'Township Row House Cluster',
        ],
      },
      {
        group: 'Commercial & Industrial',
        types: [
          'IT Park / Commercial Office Building',
          'Hospital / PHC & Institutional Campus',
          'Pre-Engineered Steel Warehouse (PEB)',
          'Retail Complex / Shopping Arcade',
        ],
      },
      {
        group: 'Highways & Bridges (NHAI / PMGSY)',
        types: [
          'NHAI Bituminous / Rigid Pavement Highway',
          'PMGSY Rural Village Road',
          'Prestressed Concrete Flyover / ROB',
          'RCC Box / Hume Pipe Culvert',
          'Major River Bridge & Approach Embankment',
        ],
      },
      {
        group: 'Water, Canal & Civic Utilities',
        types: [
          'Minor / Distributary Irrigation Canal',
          'Overhead Service Reservoir (OHSR / ESR)',
          'Jal Jeevan Rural Water Supply Scheme',
          'UGD Sewerage Network & STP',
          'Compound Wall & Industrial Gatehouse',
        ],
      },
    ],
  },

  UAE: {
    code: 'UAE',
    label: 'United Arab Emirates (UAE)',
    defaultCurrency: 'AED',
    defaultUnitSystem: 'metric',
    defaultRateSchedule: 'DM-Rates',
    defaultLocation: 'Dubai South / Al Furjan',
    rateSchedules: ['DM-Rates', 'MRS-Market', 'SOR-2026', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Villas, Towers & Hospitality',
        types: [
          'G+1 Luxury Villa & Majlis',
          'G+4+P Residential Mid-Rise',
          'High-Rise Mixed-Use Tower (Podium + Tower)',
          'Staff / Labour Accommodation Camp',
          'Boutique Hotel / Serviced Apartments',
        ],
      },
      {
        group: 'Commercial & Free-Zone Industrial',
        types: [
          'Commercial Mall / Retail Pavilion',
          'Industrial Warehouse & Cold Storage (JAFZA / KIZAD)',
          'Fit-Out & Shell-and-Core Office Floor',
        ],
      },
      {
        group: 'Roads, Infrastructure & Utilities (RTA / DM)',
        types: [
          'Multi-Lane Urban Highway & Interchange',
          'Internal Asphalt Road & Interlock Paving',
          'Box Culvert & Wadi Crossing Bridge',
          'District Cooling Plant & Piping Trench',
          'Potable Water Transmission Main & Pumping Station',
          'Stormwater & TSE Sewerage Network',
          'Precast Boundary Wall & Security Gatehouse',
        ],
      },
    ],
  },

  USA: {
    code: 'USA',
    label: 'United States (USA)',
    defaultCurrency: 'USD',
    defaultUnitSystem: 'imperial',
    defaultRateSchedule: 'RSMeans-2026',
    defaultLocation: 'Austin, Texas',
    rateSchedules: ['RSMeans-2026', 'SOR-2026', 'MRS-Market', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Residential & Multi-Family',
        types: [
          'Single-Family Custom Home (Slab-on-Grade)',
          'Multi-Family Apartment Complex (Type V / III)',
          'Townhome / Subdivision Development',
        ],
      },
      {
        group: 'Commercial & Industrial',
        types: [
          'Tilt-Up Concrete Warehouse / Logistics Hub',
          'Retail Strip Center / Commercial Shell',
          'K-12 School / Municipal Civic Building',
          'Medical Office / Outpatient Clinic',
        ],
      },
      {
        group: 'DOT Civil, Bridges & Site Utilities',
        types: [
          'DOT Asphalt Arterial / Highway Widening',
          'Concrete Curb, Gutter & Sidewalk Package',
          'Precast Concrete Box Culvert & Span Bridge',
          'Stormwater Detention Basin & RCP Drain',
          'Municipal Water Main & Elevated Tank',
          'Sanitary Sewer Force Main & Lift Station',
          'MSE / Cantilever Retaining Wall',
        ],
      },
    ],
  },

  UK: {
    code: 'UK',
    label: 'United Kingdom (UK)',
    defaultCurrency: 'GBP',
    defaultUnitSystem: 'metric',
    defaultRateSchedule: 'BCIS-UK',
    defaultLocation: 'Birmingham, West Midlands',
    rateSchedules: ['BCIS-UK', 'SOR-2026', 'MRS-Market', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Residential & Housing',
        types: [
          'Detached / Semi-Detached Brick & Block Dwelling',
          'Residential Flat Block (RC Frame)',
          'Care Home / Assisted Living Facility',
        ],
      },
      {
        group: 'Commercial & Industrial',
        types: [
          'Steel Portal Frame Industrial Unit',
          'Commercial Office Cat-A / Cat-B Fitout',
          'School / NHS Healthcare Extension',
        ],
      },
      {
        group: 'Civil, Highways & Drainage',
        types: [
          'Carriageway Surfacing & Kerbing Works',
          'Adoptable Estate Road & Section 278 Works',
          'Reinforced Concrete Culvert / Footbridge',
          'Foul & Surface Water Drainage + Attenuation Tank',
          'Potable Water Distribution Main',
          'Brick / Acoustic Boundary Wall & Fencing',
        ],
      },
    ],
  },

  EU: {
    code: 'EU',
    label: 'European Union (EU)',
    defaultCurrency: 'EUR',
    defaultUnitSystem: 'metric',
    defaultRateSchedule: 'DIN-276',
    defaultLocation: 'Munich / Bavaria, Germany',
    rateSchedules: ['DIN-276', 'SOR-2026', 'MRS-Market', 'Custom'],
    projectTypeGroups: [
      {
        group: 'Residential & Public Buildings',
        types: [
          'Single-Family Masonry / Timber Residence',
          'Multi-Storey Reinforced Concrete Apartment Block',
          'Commercial Office & Retail Building',
          'Industrial Steel Hall & Logistics Depot',
          'Public School / Municipal Facility',
        ],
      },
      {
        group: 'Civil Infrastructure & Networks',
        types: [
          'Regional Asphalt Road & Cycle Track',
          'Concrete Viaduct / Box Culvert',
          'District Heating Pipeline & Trenching',
          'Potable Water Network & Reservoir',
          'Separate Stormwater & Wastewater Sewerage',
          'Perimeter Retaining & Acoustic Wall',
        ],
      },
    ],
  },
};

export function getCountryProfile(country?: CountryCode): CountryProfile {
  return COUNTRY_CATALOG[country || 'Pakistan'] || COUNTRY_CATALOG.Pakistan;
}

export function getAllProjectTypesForCountry(country?: CountryCode): string[] {
  const profile = getCountryProfile(country);
  return profile.projectTypeGroups.flatMap((g) => g.types);
}
