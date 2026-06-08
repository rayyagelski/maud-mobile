import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { tripsApi } from '../../api';
import { generateId } from '../../utils/helpers';
import type {
  Trip,
  TripState,
  TripType,
  TransportMode,
  GpsPoint,
  TelematicsEvent,
} from '../../types/trip.types';

const initialState: TripState = {
  activeTrip: null,
  trips: [],
  isTracking: false,
  isLoading: false,
  error: null,
};

export const startTrip = createAsyncThunk(
  'trips/start',
  async (
    params: {
      vehicleId: string;
      driverId: string;
      tripType: TripType;
      transportMode: TransportMode;
    },
    { rejectWithValue },
  ) => {
    const trip: Partial<Trip> = {
      ...params,
      startTime: Date.now(),
      status: 'active',
      route: [],
      events: [],
    };
    try {
      const res = await tripsApi.create(trip);
      return res.data;
    } catch {
      // Offline fallback — create locally
      return { ...trip, id: generateId() } as Trip;
    }
  },
);

export const endTrip = createAsyncThunk(
  'trips/end',
  async (tripId: string, { getState, rejectWithValue }) => {
    const state = (getState() as { trips: TripState }).trips;
    const trip = state.activeTrip;
    if (!trip) return rejectWithValue('No active trip');

    const endTime = Date.now();
    try {
      const res = await tripsApi.update(tripId, { endTime, status: 'completed' });
      return res.data;
    } catch {
      return { ...trip, endTime, status: 'completed' as const };
    }
  },
);

export const fetchTrips = createAsyncThunk(
  'trips/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await tripsApi.list();
      return res.data;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load trips');
    }
  },
);

const tripSlice = createSlice({
  name: 'trips',
  initialState,
  reducers: {
    appendGpsPoint(state, action: PayloadAction<GpsPoint>) {
      if (state.activeTrip) {
        state.activeTrip.route.push(action.payload);
      }
    },
    addTelematicsEvent(state, action: PayloadAction<TelematicsEvent>) {
      if (state.activeTrip) {
        state.activeTrip.events.push(action.payload);
      }
    },
    setTracking(state, action: PayloadAction<boolean>) {
      state.isTracking = action.payload;
    },
    clearTripError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startTrip.pending, (state) => { state.isLoading = true; })
      .addCase(startTrip.fulfilled, (state, action: PayloadAction<Trip>) => {
        state.isLoading = false;
        state.activeTrip = action.payload;
        state.isTracking = true;
      })
      .addCase(startTrip.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(endTrip.fulfilled, (state, action: PayloadAction<Trip>) => {
        state.activeTrip = null;
        state.isTracking = false;
        const idx = state.trips.findIndex(t => t.id === action.payload.id);
        if (idx >= 0) {
          state.trips[idx] = action.payload;
        } else {
          state.trips.unshift(action.payload);
        }
      })
      .addCase(fetchTrips.fulfilled, (state, action: PayloadAction<Trip[]>) => {
        state.trips = action.payload;
      });
  },
});

export const { appendGpsPoint, addTelematicsEvent, setTracking, clearTripError } = tripSlice.actions;
export default tripSlice.reducer;
