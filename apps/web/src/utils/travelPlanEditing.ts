import { renumberDays } from '@travel-blocks/domain';
import type { DragState, TravelBlock, TravelConnection, TravelDay } from '../types/travel';
import { createId } from './id';

export function moveBlockBetweenDays(days: TravelDay[], dragState: DragState, targetDayId: string): TravelDay[] {
  const sourceDay = days.find((day) => day.id === dragState.sourceDayId);
  const movingBlock = sourceDay?.blocks.find((block) => block.id === dragState.sourceBlockId);

  if (!sourceDay || !movingBlock) {
    return days;
  }

  return days.map((day) => {
    const withoutMovingBlock = day.blocks.filter((block) => block.id !== dragState.sourceBlockId);

    if (day.id !== targetDayId) {
      return {
        ...day,
        blocks: withoutMovingBlock,
      };
    }

    return {
      ...day,
      blocks: [...withoutMovingBlock, movingBlock],
    };
  });
}

export function reorderBlockInDay(days: TravelDay[], dragState: DragState, targetDayId: string, targetBlockId: string): TravelDay[] {
  if (dragState.sourceDayId !== targetDayId) {
    return days;
  }

  return days.map((day) => {
    if (day.id !== targetDayId) {
      return day;
    }

    const sourceIndex = day.blocks.findIndex((block) => block.id === dragState.sourceBlockId);
    const targetIndex = day.blocks.findIndex((block) => block.id === targetBlockId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return day;
    }

    const nextBlocks = [...day.blocks];
    const [movingBlock] = nextBlocks.splice(sourceIndex, 1);
    nextBlocks.splice(targetIndex, 0, movingBlock);

    return {
      ...day,
      blocks: nextBlocks,
    };
  });
}

export function createEmptyFirstDay(): TravelDay[] {
  return [
    {
      id: createId('day'),
      dayNumber: 1,
      title: 'Day 1',
      blocks: [],
    },
  ];
}

export function cloneDays(days: TravelDay[]): TravelDay[] {
  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => ({ ...block })),
  }));
}

export function cloneConnections(connections: TravelConnection[] = []): TravelConnection[] {
  return connections.map((connection) => ({ ...connection }));
}

export function getNextDayTitle(days: TravelDay[]): string {
  return `Day ${days.length + 1}`;
}

export function findBlock(days: TravelDay[], dayId: string, blockId: string): TravelBlock | undefined {
  return days.find((day) => day.id === dayId)?.blocks.find((block) => block.id === blockId);
}

export function moveDayById(days: TravelDay[], sourceDayId: string, targetDayId: string): TravelDay[] {
  const sourceIndex = days.findIndex((day) => day.id === sourceDayId);
  const targetIndex = days.findIndex((day) => day.id === targetDayId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return days;
  }

  const nextDays = [...days];
  const [movingDay] = nextDays.splice(sourceIndex, 1);
  nextDays.splice(targetIndex, 0, movingDay);

  return renumberDays(nextDays);
}
