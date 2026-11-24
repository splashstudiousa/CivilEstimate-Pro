declare module 'dxf-parser' {
  export interface DxfVertex {
    x: number;
    y: number;
    z?: number;
  }

  export interface DxfParsedEntity {
    type: string;
    layer?: string;
    vertices?: DxfVertex[];
    startPoint?: DxfVertex;
    endPoint?: DxfVertex;
    center?: DxfVertex;
    radius?: number;
    position?: DxfVertex;
    text?: string;
    name?: string;
    shape?: boolean;
    xScale?: number;
    yScale?: number;
    actualMeasurement?: number;
  }

  export interface DxfParsedResult {
    header?: Record<string, unknown>;
    tables?: {
      layer?: {
        layers?: Record<string, { name: string; color?: number }>;
      };
    };
    entities?: DxfParsedEntity[];
  }

  export default class DxfParser {
    parseSync(dxfString: string): DxfParsedResult | null;
  }
}
