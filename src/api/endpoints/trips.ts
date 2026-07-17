import client from '../client';
import type { TripContext, TripEventCounters, TripEnergy, TripRewardResult } from '../../types/trip.types';

// Request/response shapes exactly as documented in
// App\Controller\API\Rewards\TripRewardController (POST /api/v1/trips/reward).
interface TripRewardRequestDto {
  vehicle_uuid: string;
  external_trip_id: string | null;
  trip_date: string; // YYYY-MM-DD
  distance_km: number;
  duration_seconds: number;
  context: {
    is_night: boolean;
    is_after_midnight: boolean;
    is_rain: boolean;
    highway_share: number;
  };
  events: {
    speeding_seconds: number;
    harsh_brake_count: number;
    harsh_accel_count: number;
    harsh_corner_count: number;
    phone_text_seconds: number;
  };
  energy?: {
    fuel_type: string;
    fuel_used_liters?: number;
    fuel_baseline_liters?: number;
    kwh_used?: number;
    kwh_baseline?: number;
    fuel_price_per_liter?: number;
    electricity_price_per_kwh?: number;
    currency_code?: string;
  };
}

interface TripRewardResponseDto {
  trip_reward_id: number;
  safety_score: number;
  eco_score: number;
  trip_reward_score: number;
  trip_points_earned: number;
  phone_subscore: number;
  distance_km: number;
  co2_avoided_grams: number | null;
  money_saved_cents: number | null;
  currency_code: string | null;
  voice_payload: { script: string; summary_key: string; highlights: string[]; tips: string[] };
  ai_narrative_tip: string | null;
}

export interface SubmitTripRewardParams {
  vehicleUuid: string;
  externalTripId: string;
  tripDate: string;
  distanceKm: number;
  durationSeconds: number;
  context: TripContext;
  events: TripEventCounters;
  energy?: TripEnergy;
}

function toRequestDto(params: SubmitTripRewardParams): TripRewardRequestDto {
  return {
    vehicle_uuid: params.vehicleUuid,
    external_trip_id: params.externalTripId,
    trip_date: params.tripDate,
    distance_km: params.distanceKm,
    duration_seconds: params.durationSeconds,
    context: {
      is_night: params.context.isNight,
      is_after_midnight: params.context.isAfterMidnight,
      is_rain: params.context.isRain,
      highway_share: params.context.highwayShare,
    },
    events: {
      speeding_seconds: params.events.speedingSeconds,
      harsh_brake_count: params.events.harshBrakeCount,
      harsh_accel_count: params.events.harshAccelCount,
      harsh_corner_count: params.events.harshCornerCount,
      phone_text_seconds: params.events.phoneTextSeconds,
    },
    ...(params.energy && {
      energy: {
        fuel_type: params.energy.fuelType,
        fuel_used_liters: params.energy.fuelUsedLiters,
        fuel_baseline_liters: params.energy.fuelBaselineLiters,
        kwh_used: params.energy.kwhUsed,
        kwh_baseline: params.energy.kwhBaseline,
        fuel_price_per_liter: params.energy.fuelPricePerLiter,
        electricity_price_per_kwh: params.energy.electricityPricePerKwh,
        currency_code: params.energy.currencyCode,
      },
    }),
  };
}

function fromResponseDto(dto: TripRewardResponseDto): TripRewardResult {
  return {
    tripRewardId: dto.trip_reward_id,
    safetyScore: dto.safety_score,
    ecoScore: dto.eco_score,
    tripRewardScore: dto.trip_reward_score,
    tripPointsEarned: dto.trip_points_earned,
    phoneSubscore: dto.phone_subscore,
    distanceKm: dto.distance_km,
    co2AvoidedGrams: dto.co2_avoided_grams,
    moneySavedCents: dto.money_saved_cents,
    currencyCode: dto.currency_code,
    voicePayload: {
      script: dto.voice_payload.script,
      summaryKey: dto.voice_payload.summary_key,
      highlights: dto.voice_payload.highlights,
      tips: dto.voice_payload.tips,
    },
    aiNarrativeTip: dto.ai_narrative_tip ?? null,
  };
}

export const tripsApi = {
  submitTripReward: async (params: SubmitTripRewardParams): Promise<TripRewardResult> => {
    const res = await client.post<TripRewardResponseDto>('/trips/reward', toRequestDto(params));
    return fromResponseDto(res.data);
  },
};
