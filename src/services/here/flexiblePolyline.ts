// Decoder for HERE's "flexible polyline" format returned by Routing API v8.
// Spec: https://github.com/heremaps/flexible-polyline
const ENCODING_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DECODING_TABLE: Record<string, number> = {};
for (let i = 0; i < ENCODING_TABLE.length; i++) {
  DECODING_TABLE[ENCODING_TABLE[i]] = i;
}

function decodeUnsignedValues(encoded: string): number[] {
  const result: number[] = [];
  let shift = 0;
  let value = 0;
  for (const char of encoded) {
    const b = DECODING_TABLE[char];
    if (b === undefined) throw new Error(`Invalid flexible-polyline character: ${char}`);
    value |= (b & 0x1f) << shift;
    if (b < 0x20) {
      result.push(value);
      value = 0;
      shift = 0;
    } else {
      shift += 5;
    }
  }
  return result;
}

function decodeSignedValue(value: number): number {
  return value & 1 ? -((value + 1) >> 1) : value >> 1;
}

export interface DecodedPolylinePoint {
  latitude: number;
  longitude: number;
  third?: number;
}

export interface DecodedPolyline {
  precision: number;
  thirdDim: number;
  thirdDimPrecision: number;
  coordinates: DecodedPolylinePoint[];
}

export function decodeFlexiblePolyline(encoded: string): DecodedPolyline {
  const values = decodeUnsignedValues(encoded);
  // values[0] = version (unused beyond the format being v1), values[1] = packed header
  const headerValue = values[1] ?? 0;
  const precision = headerValue & 0xf;
  const thirdDim = (headerValue >> 4) & 0x7;
  const thirdDimPrecision = (headerValue >> 7) & 0xf;

  const latLngFactor = Math.pow(10, precision);
  const thirdFactor = Math.pow(10, thirdDimPrecision);

  let lat = 0;
  let lng = 0;
  let third = 0;
  const coordinates: DecodedPolylinePoint[] = [];

  let i = 2;
  while (i < values.length) {
    lat += decodeSignedValue(values[i++]);
    lng += decodeSignedValue(values[i++]);
    const point: DecodedPolylinePoint = {
      latitude: lat / latLngFactor,
      longitude: lng / latLngFactor,
    };
    if (thirdDim) {
      third += decodeSignedValue(values[i++]);
      point.third = third / thirdFactor;
    }
    coordinates.push(point);
  }

  return { precision, thirdDim, thirdDimPrecision, coordinates };
}
