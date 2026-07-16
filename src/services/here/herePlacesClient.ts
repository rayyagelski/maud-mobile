import { HERE_API_KEY } from '../../config/env';
import type { LatLng } from './hereRoutingClient';

export interface NearbyGarage {
  id: string;
  name: string;
  address: string;
  phone?: string;
  distanceMeters: number;
}

interface HereDiscoverResponse {
  items: Array<{
    id: string;
    title: string;
    address: { label: string };
    distance: number;
    contacts?: Array<{ phone?: Array<{ value: string }> }>;
  }>;
}

// HERE Geocoding & Search "Discover" endpoint — same API key/pattern as
// hereRoutingClient.ts. Used for real nearby-garage lookup on BreakdownScreen.
export async function searchNearbyGarages(location: LatLng, limit = 5): Promise<NearbyGarage[]> {
  const params = new URLSearchParams({
    at: `${location.latitude},${location.longitude}`,
    q: 'car repair',
    limit: String(limit),
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://discover.search.hereapi.com/v1/discover?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE discover request failed (${response.status})`);
  }

  const data: HereDiscoverResponse = await response.json();
  return data.items.map(item => ({
    id: item.id,
    name: item.title,
    address: item.address.label,
    phone: item.contacts?.[0]?.phone?.[0]?.value,
    distanceMeters: item.distance,
  }));
}
