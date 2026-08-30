import type { DragState, TravelConnection, TravelDay } from '@travel-blocks/shared';

export function renumberDays(days: TravelDay[]): TravelDay[] { return days.map((day, index) => ({ ...day, dayNumber: index + 1 })); }

export function moveBlock(days: TravelDay[], drag: DragState, targetDayId: string, targetBlockId?: string): TravelDay[] {
  const block = days.find((day) => day.id === drag.sourceDayId)?.blocks.find((item) => item.id === drag.sourceBlockId);
  if (!block || !days.some((day) => day.id === targetDayId)) return days;
  return days.map((day) => {
    const blocks = day.blocks.filter((item) => item.id !== block.id);
    if (day.id !== targetDayId) return { ...day, blocks };
    const index = targetBlockId ? blocks.findIndex((item) => item.id === targetBlockId) : -1;
    blocks.splice(index < 0 ? blocks.length : index, 0, block);
    return { ...day, blocks };
  });
}

export function cleanupConnections(days: TravelDay[], connections: TravelConnection[]): TravelConnection[] {
  const dayBlocks = new Map(days.map((day) => [day.id, new Set(day.blocks.map((block) => block.id))]));
  return connections.filter((connection) => dayBlocks.get(connection.dayId)?.has(connection.sourceBlockId) && dayBlocks.get(connection.dayId)?.has(connection.targetBlockId));
}

export function validateConnection(days: TravelDay[], connection: TravelConnection): { valid: boolean; reason?: string } {
  if (connection.sourceBlockId === connection.targetBlockId) return { valid: false, reason: '같은 블록은 연결할 수 없습니다.' };
  const day = days.find((item) => item.id === connection.dayId);
  if (!day) return { valid: false, reason: 'Day를 찾을 수 없습니다.' };
  const ids = new Set(day.blocks.map((block) => block.id));
  return ids.has(connection.sourceBlockId) && ids.has(connection.targetBlockId) ? { valid: true } : { valid: false, reason: '같은 Day의 블록만 연결할 수 있습니다.' };
}

export function normalizePlan(days: TravelDay[], connections: TravelConnection[]) { const normalizedDays = renumberDays(days); return { days: normalizedDays, connections: cleanupConnections(normalizedDays, connections) }; }

export * from './itineraryValidation.js';
