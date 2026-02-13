import { describe, expect, it } from 'vitest';
import { normalizeStarfaceBaseUrl } from '../src/starface/url.js';

describe('normalizeStarfaceBaseUrl', () => {
  it('converts instance names to starface cloud URL', () => {
    expect(normalizeStarfaceBaseUrl('firma123')).toBe('https://firma123.starface-cloud.com');
  });

  it('normalizes http to https and removes trailing slash', () => {
    expect(normalizeStarfaceBaseUrl('http://kundenanlage01.starface-cloud.com/')).toBe(
      'https://kundenanlage01.starface-cloud.com',
    );
  });
});
