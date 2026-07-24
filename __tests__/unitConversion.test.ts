import {
  kmToMiles, litersToGallons, gramsToLbs, formatDistance, estimateFuelCo2Grams,
} from '../src/utils/helpers';

describe('kmToMiles / litersToGallons / gramsToLbs', () => {
  it('converts km to miles', () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 5);
  });

  it('converts liters to US gallons', () => {
    expect(litersToGallons(3.785411784)).toBeCloseTo(1, 5);
  });

  it('converts grams to pounds', () => {
    expect(gramsToLbs(453.59237)).toBeCloseTo(1, 5);
  });
});

describe('formatDistance', () => {
  it('defaults to metric (km/m)', () => {
    expect(formatDistance(1.5)).toBe('1.5km');
    expect(formatDistance(0.5)).toBe('500m');
  });

  it('shows miles when imperial', () => {
    expect(formatDistance(1.609344, true)).toBe('1.0mi');
  });

  it('shows feet for very short imperial distances', () => {
    expect(formatDistance(0.01, true)).toMatch(/ft$/);
  });
});

describe('estimateFuelCo2Grams', () => {
  it('estimates CO2 for petrol', () => {
    expect(estimateFuelCo2Grams('petrol', 10)).toBe(23100);
  });

  it('estimates CO2 for diesel (higher factor than petrol)', () => {
    expect(estimateFuelCo2Grams('diesel', 10)).toBeGreaterThan(estimateFuelCo2Grams('petrol', 10) as number);
  });

  it('treats hybrid as petrol-based', () => {
    expect(estimateFuelCo2Grams('hybrid', 10)).toBe(estimateFuelCo2Grams('petrol', 10));
  });

  it('returns null for electric (no client-side grid-intensity data)', () => {
    expect(estimateFuelCo2Grams('electric', 10)).toBeNull();
  });

  it('returns null for hydrogen (zero-tailpipe, no combustion factor)', () => {
    expect(estimateFuelCo2Grams('hydrogen', 10)).toBeNull();
  });

  it('returns null when fuel type is unknown', () => {
    expect(estimateFuelCo2Grams(undefined, 10)).toBeNull();
  });
});
