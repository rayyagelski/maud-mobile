import client from '../client';

// Distance/duration/cost are computed client-side (HERE routing + the
// fuel-price endpoint) — this endpoint only adds the AI's natural-language
// judgement call between already-known options, matching
// App\Handler\API\Route\GetRouteRecommendationHandler's expected shape.
export interface RouteRecommendationOption {
  index: number;
  distanceKm: number;
  durationSeconds: number;
  cost: number | null;
  currencyCode: string | null;
}

export interface RouteRecommendationResult {
  recommendedIndex: number;
  message: string;
}

interface RouteRecommendationResponseDto {
  recommendedIndex?: number;
  message?: string;
  status?: string;
}

export const routesApi = {
  // Returns null on any failure/unavailability (fail-soft, matches the
  // backend's own "recommendation_unavailable" convention) — callers should
  // just render nothing rather than treat this as an error.
  getRecommendation: async (options: RouteRecommendationOption[]): Promise<RouteRecommendationResult | null> => {
    const res = await client.post<RouteRecommendationResponseDto>('/routes/recommendation', { options });
    if (res.data.recommendedIndex == null || !res.data.message) return null;
    return { recommendedIndex: res.data.recommendedIndex, message: res.data.message };
  },
};
