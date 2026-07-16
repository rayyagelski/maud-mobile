import client from '../client';

export interface ActiveCountry {
  name: string;
  code: string;
}

export const countriesApi = {
  listActive: () => client.get<{ countries: ActiveCountry[] }>('/countries'),
};
