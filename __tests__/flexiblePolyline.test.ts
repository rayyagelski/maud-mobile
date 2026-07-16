import { decodeFlexiblePolyline } from '../src/services/here/flexiblePolyline';

// Official test vector from https://github.com/heremaps/flexible-polyline
describe('decodeFlexiblePolyline', () => {
  it('decodes the reference test vector correctly', () => {
    const result = decodeFlexiblePolyline('BFoz5xJ67i1B1B7PzIhaxL7Y');

    expect(result.precision).toBe(5);
    expect(result.thirdDim).toBe(0);
    expect(result.coordinates).toHaveLength(4);

    const expected = [
      [50.10228, 8.69821],
      [50.10201, 8.69567],
      [50.10063, 8.69150],
      [50.09878, 8.68752],
    ];
    result.coordinates.forEach((point, i) => {
      expect(point.latitude).toBeCloseTo(expected[i][0], 5);
      expect(point.longitude).toBeCloseTo(expected[i][1], 5);
    });
  });
});
