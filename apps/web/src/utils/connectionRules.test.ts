import { describe, expect, it } from 'vitest';
import type { TravelBlock, TravelConnection } from '../types/travel';
import { getConnectableBlocks, getNextConnectableBlock, sortBlocksByDisplayOrder, validateConnection } from './connectionRules';

const blocks: TravelBlock[] = [
  { id: 'a', title: 'A', category: 'food', priceLevel: 'low' },
  { id: 'b', title: 'B', category: 'cafe', priceLevel: 'low' },
  { id: 'c', title: 'C', category: 'sightseeing', priceLevel: 'low' },
];
const connection: TravelConnection = { id: 'ab', dayId: 'day-1', sourceBlockId: 'a', targetBlockId: 'b' };

describe('block connection editing rules', () => {
  it('only connects the immediately following displayed block', () => {
    expect(validateConnection(blocks[0], blocks[1], blocks, [], 'day-1')).toEqual({ ok: true });
    expect(validateConnection(blocks[0], blocks[2], blocks, [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[1], blocks[0], blocks, [], 'day-1').ok).toBe(false);
    expect(getConnectableBlocks(blocks[0], blocks, [], 'day-1')).toEqual([blocks[1]]);
  });

  it('rejects deleted, missing, self, last-block, and duplicate connections', () => {
    expect(validateConnection(undefined, blocks[1], blocks, [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[0], undefined, blocks, [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[0], blocks[0], blocks, [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[0], blocks[1], [blocks[0]], [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[2], blocks[0], blocks, [], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[0], blocks[1], blocks, [connection], 'day-1').ok).toBe(false);
    expect(validateConnection(blocks[0], blocks[1], blocks, [{ ...connection, dayId: 'day-2' }], 'day-1').ok).toBe(true);
  });

  it('handles absent and last sources without mutating or reordering the input', () => {
    const input = structuredClone(blocks);
    const before = structuredClone(input);
    Object.freeze(input);
    expect(getNextConnectableBlock('missing', input)).toBeNull();
    expect(getNextConnectableBlock('c', input)).toBeNull();
    expect(getNextConnectableBlock('a', input)).toBe(input[1]);
    expect(getConnectableBlocks(input[2], input, [], 'day-1')).toEqual([]);
    expect(input).toEqual(before);
    const copied = sortBlocksByDisplayOrder(input);
    expect(copied).toEqual(input);
    expect(copied).not.toBe(input);
  });
});
