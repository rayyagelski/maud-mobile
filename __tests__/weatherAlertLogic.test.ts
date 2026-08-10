import { alertSignature, pickNewAlert } from '../src/utils/weatherAlertLogic';
import type { WeatherAlert } from '../src/services/weather/hereWeatherClient';

const RAIN: WeatherAlert = { type: 4, description: 'Heavy rain anticipated' };
const WIND: WeatherAlert = { type: 7, description: 'High wind warning' };

describe('alertSignature', () => {
  it('combines type and description', () => {
    expect(alertSignature(RAIN)).toBe('4:Heavy rain anticipated');
  });
});

describe('pickNewAlert', () => {
  it('returns null for an empty alert list', () => {
    expect(pickNewAlert([], new Set())).toBeNull();
  });

  it('returns the first alert when nothing has been seen yet', () => {
    expect(pickNewAlert([RAIN, WIND], new Set())).toEqual(RAIN);
  });

  it('skips an alert already in the seen set', () => {
    const seen = new Set([alertSignature(RAIN)]);
    expect(pickNewAlert([RAIN, WIND], seen)).toEqual(WIND);
  });

  it('returns null once every alert has already been seen', () => {
    const seen = new Set([alertSignature(RAIN), alertSignature(WIND)]);
    expect(pickNewAlert([RAIN, WIND], seen)).toBeNull();
  });
});
