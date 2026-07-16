import { parseMaxSpeedTag } from '../src/services/overpass/speedCameraClient';

describe('parseMaxSpeedTag', () => {
  it('parses a bare km/h number', () => {
    expect(parseMaxSpeedTag('50')).toBe(50);
  });

  it('converts mph values to km/h', () => {
    expect(parseMaxSpeedTag('30 mph')).toBe(48); // 30 * 1.60934 rounded
  });

  it('returns undefined for missing or unparseable tags', () => {
    expect(parseMaxSpeedTag(undefined)).toBeUndefined();
    expect(parseMaxSpeedTag('walk')).toBeUndefined();
  });
});
