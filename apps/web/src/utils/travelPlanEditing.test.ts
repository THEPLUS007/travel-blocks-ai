import { describe, expect, it } from 'vitest';
import type { TravelDay } from '../types/travel';
import { cloneConnections, cloneDays, findBlock, moveBlockBetweenDays, moveDayById, reorderBlockInDay } from './travelPlanEditing';

function fixture(): TravelDay[] {
  return [
    { id: 'one', dayNumber: 1, title: 'Day 1', blocks: [
      { id: 'a', title: 'A', category: 'food', priceLevel: 'low' },
      { id: 'b', title: 'B', category: 'cafe', priceLevel: 'low' },
    ] },
    { id: 'two', dayNumber: 2, title: 'Day 2', blocks: [
      { id: 'c', title: 'C', category: 'sightseeing', priceLevel: 'medium' },
    ] },
  ];
}

describe('travel plan editing helpers', () => {
  it('moves a block between days without changing the saved input', () => {
    const days = fixture();
    const before = structuredClone(days);
    const moved = moveBlockBetweenDays(days, { sourceDayId: 'one', sourceBlockId: 'a' }, 'two');
    expect(moved.map((day) => day.blocks.map((block) => block.id))).toEqual([['b'], ['c', 'a']]);
    expect(days).toEqual(before);
  });

  it('preserves the input for missing source blocks and cross-day reordering', () => {
    const days = fixture();
    expect(moveBlockBetweenDays(days, { sourceDayId: 'one', sourceBlockId: 'missing' }, 'two')).toBe(days);
    expect(reorderBlockInDay(days, { sourceDayId: 'one', sourceBlockId: 'a' }, 'two', 'c')).toBe(days);
    expect(moveDayById(days, 'missing', 'two')).toBe(days);
  });

  it('reorders a day locally without modifying the other day or input blocks', () => {
    const days = fixture();
    const reordered = reorderBlockInDay(days, { sourceDayId: 'one', sourceBlockId: 'b' }, 'one', 'a');
    expect(reordered[0].blocks.map((block) => block.id)).toEqual(['b', 'a']);
    expect(reordered[1]).toBe(days[1]);
    expect(days[0].blocks.map((block) => block.id)).toEqual(['a', 'b']);
  });

  it('renumbers moved days using the shared domain rule', () => {
    const days = fixture();
    expect(moveDayById(days, 'two', 'one').map(({ id, dayNumber }) => ({ id, dayNumber }))).toEqual([
      { id: 'two', dayNumber: 1 }, { id: 'one', dayNumber: 2 },
    ]);
    expect(days.map((day) => day.id)).toEqual(['one', 'two']);
  });

  it('clones editable day/block/connection containers and keeps safe lookups scoped to a day', () => {
    const days = fixture();
    const copy = cloneDays(days);
    copy[0].blocks[0].title = 'Edited';
    expect(days[0].blocks[0].title).toBe('A');
    expect(findBlock(days, 'two', 'a')).toBeUndefined();
    expect(findBlock(days, 'one', 'a')).toBe(days[0].blocks[0]);
    const connections = [{ id: 'link', dayId: 'one', sourceBlockId: 'a', targetBlockId: 'b' }];
    expect(cloneConnections(connections)[0]).not.toBe(connections[0]);
    expect(cloneConnections()).toEqual([]);
  });
});
