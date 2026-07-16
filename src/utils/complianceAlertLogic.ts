// Pure, unit-testable logic for speed-camera/enforcement-zone alerts (SRS 4.5).
// Sensor/network side effects live in useComplianceMonitor + speedCameraClient.

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface SpeedCamera extends Coordinate {
  id: string;
  speedLimitKmh?: number;
}

export interface ComplianceAlert {
  cameraId: string;
  distanceMeters: number;
  speedLimitKmh?: number;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

// Nearest camera within radiusKm, or null if none are close enough.
export function findNearestCameraWithinRadius(
  cameras: SpeedCamera[],
  position: Coordinate,
  radiusKm: number,
): ComplianceAlert | null {
  let nearest: { camera: SpeedCamera; distanceMeters: number } | null = null;
  for (const camera of cameras) {
    const distanceMeters = haversineMeters(position, camera);
    if (distanceMeters <= radiusKm * 1000 && (!nearest || distanceMeters < nearest.distanceMeters)) {
      nearest = { camera, distanceMeters };
    }
  }
  if (!nearest) return null;
  return {
    cameraId: nearest.camera.id,
    distanceMeters: nearest.distanceMeters,
    speedLimitKmh: nearest.camera.speedLimitKmh,
  };
}

// Whether the cached camera list is stale enough (vehicle has moved far
// enough from where it was last queried) to warrant a fresh Overpass query.
export function shouldRefreshCache(
  lastQueryPoint: Coordinate | null,
  currentPoint: Coordinate,
  thresholdKm: number,
): boolean {
  if (!lastQueryPoint) return true;
  return haversineMeters(lastQueryPoint, currentPoint) >= thresholdKm * 1000;
}
