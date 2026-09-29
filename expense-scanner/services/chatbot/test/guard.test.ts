import { describe, expect, it } from 'vitest';
import { isShortFollowUp, parseVerdict } from '../src/guard';

describe('topic guard', () => {
  it('lets short confirmations through only when there is a conversation', () => {
    expect(isShortFollowUp('yes', true)).toBe(true);
    expect(isShortFollowUp('Go ahead!', true)).toBe(true);
    expect(isShortFollowUp('yes', false)).toBe(false);
    expect(isShortFollowUp('yes, and write me a poem', true)).toBe(false);
  });
  it('fails closed on anything but an explicit true', () => {
    expect(parseVerdict('{"in_scope": true}')).toBe(true);
    expect(parseVerdict('{"in_scope": false}')).toBe(false);
    expect(parseVerdict('{"in_scope": "true"}')).toBe(false);
    expect(parseVerdict('sure!')).toBe(false);
  });
});
