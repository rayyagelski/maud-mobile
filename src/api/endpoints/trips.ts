import client from '../client';
import type { Trip } from '../../types/trip.types';

export const tripsApi = {
  list: () =>
    client.get<Trip[]>('/trips'),

  get: (tripId: string) =>
    client.get<Trip>(`/trips/${tripId}`),

  create: (data: Partial<Trip>) =>
    client.post<Trip>('/trips', data),

  update: (tripId: string, data: Partial<Trip>) =>
    client.patch<Trip>(`/trips/${tripId}`, data),

  addEvents: (tripId: string, events: Trip['events']) =>
    client.post(`/trips/${tripId}/events`, { events }),
};
