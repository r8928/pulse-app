import { describe, expect, it } from 'vitest';
import { plural } from '../plural.js';

describe('plural', () => {
  it('leaves a single thing singular', () => {
    expect(plural(1, 'row')).toBe('1 row');
  });

  it('adds s to a regular noun', () => {
    expect(plural(2, 'row')).toBe('2 rows');
    expect(plural(0, 'row')).toBe('0 rows');
  });

  it('adds es to a sibilant ending, which is why this exists', () => {
    // The inline version this replaced said "2 punchs" on S-11.
    expect(plural(2, 'punch')).toBe('2 punches');
    expect(plural(3, 'box')).toBe('3 boxes');
  });

  it('pluralises the head of a phrase it is given whole', () => {
    expect(plural(2, 'day record')).toBe('2 day records');
    expect(plural(2, 'untracked colleague')).toBe('2 untracked colleagues');
  });
});
