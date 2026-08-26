import type { TravelBlock, TravelConnection } from '../types/travel';

export interface ConnectionValidationResult {
  ok: boolean;
  reason?: string;
}

export function sortBlocksByDisplayOrder(blocks: TravelBlock[]): TravelBlock[] {
  return [...blocks];
}

function getBlockIndex(blockId: string, allBlocks: TravelBlock[]): number {
  return sortBlocksByDisplayOrder(allBlocks).findIndex((block) => block.id === blockId);
}

export function getNextConnectableBlock(sourceBlockId: string, allBlocks: TravelBlock[]): TravelBlock | null {
  const sortedBlocks = sortBlocksByDisplayOrder(allBlocks);
  const sourceIndex = sortedBlocks.findIndex((block) => block.id === sourceBlockId);

  if (sourceIndex < 0) {
    return null;
  }

  return sortedBlocks[sourceIndex + 1] ?? null;
}

export function validateConnection(
  sourceBlock: TravelBlock | undefined,
  targetBlock: TravelBlock | undefined,
  allBlocks: TravelBlock[],
  existingConnections: TravelConnection[],
  dayId: string,
): ConnectionValidationResult {
  if (!sourceBlock || !targetBlock) {
    return { ok: false, reason: '연결할 블록을 찾을 수 없습니다.' };
  }

  if (sourceBlock.id === targetBlock.id) {
    return { ok: false, reason: '같은 블록끼리는 연결할 수 없습니다.' };
  }

  const sourceIndex = getBlockIndex(sourceBlock.id, allBlocks);
  const targetIndex = getBlockIndex(targetBlock.id, allBlocks);

  if (sourceIndex < 0 || targetIndex < 0) {
    return { ok: false, reason: '삭제되었거나 현재 Day에 없는 블록은 연결할 수 없습니다.' };
  }

  const nextBlock = getNextConnectableBlock(sourceBlock.id, allBlocks);

  if (!nextBlock) {
    return { ok: false, reason: '아래에 연결할 블록이 없습니다.' };
  }

  if (nextBlock.id !== targetBlock.id) {
    return { ok: false, reason: '바로 다음 블록에만 연결할 수 있습니다.' };
  }

  const alreadyExists = existingConnections.some(
    (connection) =>
      connection.dayId === dayId &&
      connection.sourceBlockId === sourceBlock.id &&
      connection.targetBlockId === targetBlock.id,
  );

  if (alreadyExists) {
    return { ok: false, reason: '이미 연결된 블록입니다.' };
  }

  return { ok: true };
}

export function getConnectableBlocks(
  sourceBlock: TravelBlock,
  allBlocks: TravelBlock[],
  existingConnections: TravelConnection[],
  dayId: string,
): TravelBlock[] {
  const nextBlock = getNextConnectableBlock(sourceBlock.id, allBlocks);

  if (!nextBlock) {
    return [];
  }

  return validateConnection(sourceBlock, nextBlock, allBlocks, existingConnections, dayId).ok ? [nextBlock] : [];
}
