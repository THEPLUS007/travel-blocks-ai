import { describe, expect, it } from 'vitest';
import { cleanupConnections, moveBlock, renumberDays, validateConnection } from '../src/index.js';
import type { TravelDay } from '@travel-blocks/shared';
const block = (id: string) => ({ id, title: id, category: 'sightseeing' as const, priceLevel: 'low' as const });
const days: TravelDay[] = [{ id:'d2', dayNumber:2, title:'two', blocks:[block('a'),block('b')] }, { id:'d1', dayNumber:9, title:'one', blocks:[] }];
describe('travel domain', () => {
  it('Day 번호를 재정렬한다', () => expect(renumberDays(days).map((d) => d.dayNumber)).toEqual([1,2]));
  it('블록을 Day 사이에서 이동한다', () => expect(moveBlock(days,{sourceDayId:'d2',sourceBlockId:'a'},'d1')[1].blocks[0].id).toBe('a'));
  it('잘못된 연결을 차단한다', () => expect(validateConnection(days,{id:'c',dayId:'d2',sourceBlockId:'a',targetBlockId:'x'}).valid).toBe(false));
  it('삭제된 블록의 연결을 정리한다', () => expect(cleanupConnections(days,[{id:'c',dayId:'d2',sourceBlockId:'a',targetBlockId:'x'}])).toEqual([]));
});
