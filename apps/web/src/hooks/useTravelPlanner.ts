import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_TRIP_FORM } from '../constants/travel';
import { inferTravelSourceType } from '../services/sourceTypeService';
import * as travelApi from '../services/travelApi';
import type {
  DragState,
  SavedTravelPlan,
  TravelBlock,
  TravelConnection,
  TravelDay,
  TravelSourceType,
  TripFormData,
} from '../types/travel';
import { validateConnection } from '../utils/connectionRules';
import { createId } from '../utils/id';

function moveBlockBetweenDays(days: TravelDay[], dragState: DragState, targetDayId: string): TravelDay[] {
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

function reorderBlockInDay(days: TravelDay[], dragState: DragState, targetDayId: string, targetBlockId: string): TravelDay[] {
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

function createEmptyFirstDay(): TravelDay[] {
  return [
    {
      id: createId('day'),
      dayNumber: 1,
      title: 'Day 1',
      blocks: [],
    },
  ];
}

function cloneDays(days: TravelDay[]): TravelDay[] {
  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => ({ ...block })),
  }));
}

function cloneConnections(connections: TravelConnection[] = []): TravelConnection[] {
  return connections.map((connection) => ({ ...connection }));
}

function renumberDays(days: TravelDay[]): TravelDay[] {
  return days.map((day, index) => ({
    ...day,
    dayNumber: index + 1,
  }));
}

function getNextDayTitle(days: TravelDay[]): string {
  return `Day ${days.length + 1}`;
}

function findBlock(days: TravelDay[], dayId: string, blockId: string): TravelBlock | undefined {
  return days.find((day) => day.id === dayId)?.blocks.find((block) => block.id === blockId);
}

function moveDayById(days: TravelDay[], sourceDayId: string, targetDayId: string): TravelDay[] {
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

export function useTravelPlanner() {
  const [trip, setTrip] = useState<TripFormData>(EMPTY_TRIP_FORM);
  const [sourceType, setSourceType] = useState<TravelSourceType>('youtube');
  const [sourceContent, setSourceContent] = useState('');
  const [days, setDays] = useState<TravelDay[]>([]);
  const [connections, setConnections] = useState<TravelConnection[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string>('day-1');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('여행 정보를 입력하고 링크 또는 텍스트를 분석해 주세요.');
  const [errorMessage, setErrorMessage] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dayDragId, setDayDragId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [currentTripVersion, setCurrentTripVersion] = useState(1);
  const [recommendations, setRecommendations] = useState<TravelBlock[]>([]);
  const activeAiRequestRef = useRef<{ key: string; promise: Promise<unknown> } | null>(null);

  const selectedDay = useMemo(
    () => days.find((day) => day.id === selectedDayId) ?? days[0],
    [days, selectedDayId],
  );

  const markDirty = useCallback(() => setIsDirty(true), []);

  const runSingleAiRequest = useCallback(<T,>(key: string, task: () => Promise<T>): Promise<T> => {
    if (activeAiRequestRef.current?.key === key) {
      return activeAiRequestRef.current.promise as Promise<T>;
    }

    const promise = task().finally(() => {
      if (activeAiRequestRef.current?.key === key) {
        activeAiRequestRef.current = null;
      }
    });
    activeAiRequestRef.current = { key, promise };
    return promise;
  }, []);

  const saveCurrentPlan = useCallback(async () => {
    try {
      const savedPlan = currentTripId ? await travelApi.updateSavedTrip(currentTripId, currentTripVersion, { trip, days, connections }) : await travelApi.createSavedTrip({ trip, days, connections });
      setCurrentTripId(savedPlan.id);
      setCurrentTripVersion(savedPlan.version ?? 1);
      setIsDirty(false);
      setIsSaved(true);
      setStatusMessage('저장되었습니다.');
      setErrorMessage('');
      return true;
    } catch (error) {
      console.error('[useTravelPlanner] 여행 저장 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '여행 저장 중 오류가 발생했습니다.');
      return false;
    }
  }, [connections, currentTripId, currentTripVersion, days, trip]);

  const resetPlanner = useCallback(() => {
    setTrip(EMPTY_TRIP_FORM);
    setSourceType('youtube');
    setSourceContent('');
    setDays([]);
    setConnections([]);
    setSelectedDayId('day-1');
    setHasStarted(false);
    setDragState(null);
    setDayDragId(null);
    setIsDirty(false);
    setIsSaved(false);
    setCurrentTripId(null);
    setCurrentTripVersion(1);
    setStatusMessage('여행 정보를 입력하고 링크 또는 텍스트를 분석해 주세요.');
    setErrorMessage('');
  }, []);

  const loadSavedPlan = useCallback((plan: SavedTravelPlan) => {
    const nextDays = cloneDays(plan.days);
    setTrip({ ...plan.trip });
    setDays(nextDays);
    setConnections(cloneConnections(plan.connections));
    setSelectedDayId(nextDays[0]?.id ?? 'day-1');
    setHasStarted(true);
    setDragState(null);
    setDayDragId(null);
    setIsDirty(false);
    setIsSaved(true);
    setCurrentTripId(plan.id);
    setCurrentTripVersion(plan.version ?? 1);
    setStatusMessage(plan.title + ` 일정을 불러왔습니다.`);
    setErrorMessage('');
  }, []);

  const saveTrip = useCallback((nextTrip: TripFormData) => {
    try {
      if (!nextTrip.name.trim() || !nextTrip.country.trim() || !nextTrip.duration.trim()) {
        throw new Error('여행 이름, 국가, 기간은 반드시 입력해야 합니다.');
      }

      setTrip(nextTrip);
      markDirty();
      setStatusMessage('여행 정보가 적용되었습니다. 저장하려면 현재 여행 일정 저장을 눌러주세요.');
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 여행 정보 수정 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '여행 정보 수정 중 오류가 발생했습니다.');
    }
  }, [markDirty]);

  const createManualTrip = useCallback(async (nextTrip: TripFormData) => {
    try {
      if (!nextTrip.name.trim() || !nextTrip.country.trim() || !nextTrip.city.trim() || !nextTrip.duration.trim()) {
        throw new Error('여행 제목, 국가, 도시, 기간은 반드시 입력해야 합니다.');
      }

      const plan = await travelApi.createTripFromForm(nextTrip);
      const nextDays = plan.days.length > 0 ? plan.days : createEmptyFirstDay();
      setTrip(plan.trip);
      setDays(nextDays);
      setConnections(plan.connections);
      setSelectedDayId(nextDays[0].id);
      setHasStarted(true);
      setIsDirty(true);
      setIsSaved(false);
      setCurrentTripId(null);
    setCurrentTripVersion(1);
      setStatusMessage(plan.trip.name + ` 여행이 빈 블록 보드로 생성되었습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 직접 여행 생성 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '직접 여행 생성 중 오류가 발생했습니다.');
    }
  }, []);

  const analyze = useCallback(async (override?: { sourceType?: TravelSourceType; content?: string }) => {
    const content = (override?.content ?? sourceContent).trim();
    const requestKey = `analyze:${content}`;
    setIsAnalyzing(true);
    setErrorMessage('');
    setStatusMessage('입력한 여행 소스를 분석하고 있습니다.');

    try {
      const inferredSourceType = override?.sourceType ?? inferTravelSourceType(content);
      const analyzedDays = await runSingleAiRequest(requestKey, () => travelApi.analyzeLinkOrText({
        sourceType: inferredSourceType,
        content,
      }));

      setSourceType(inferredSourceType);

      setDays(analyzedDays);
      setConnections([]);
      setSelectedDayId(analyzedDays[0]?.id ?? 'day-1');
      setHasStarted(true);
      setIsDirty(true);
      setIsSaved(false);
      setCurrentTripId(null);
    setCurrentTripVersion(1);
      setStatusMessage(analyzedDays.length + `일 일정이 생성되었습니다.`);
      return analyzedDays;
    } catch (error) {
      console.error('[useTravelPlanner] 분석 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.');
      setStatusMessage('분석을 완료하지 못했습니다.');
      return [];
    } finally {
      setIsAnalyzing(false);
    }
  }, [runSingleAiRequest, sourceContent]);

  const createAiTrip = useCallback(
    async (content: string) => {
      const nextContent = content.trim();
      setIsAnalyzing(true);
      setErrorMessage('');
      setStatusMessage('AI 여행 일정을 생성하고 있습니다.');

      try {
        const plan = await runSingleAiRequest(`generate-trip:${nextContent}`, () => travelApi.generateTripWithAI(nextContent));
        setTrip(plan.trip);
        setSourceType('text');
        setSourceContent(nextContent);
        setDays(plan.days);
        setConnections(plan.connections);
        setSelectedDayId(plan.days[0]?.id ?? 'day-1');
        setHasStarted(true);
        setIsDirty(true);
        setIsSaved(false);
        setCurrentTripId(null);
    setCurrentTripVersion(1);
        setStatusMessage(plan.days.length + `일 일정이 생성되었습니다.`);
        setErrorMessage('');
      } catch (error) {
        console.error('[useTravelPlanner] AI 여행 생성 실패', error);
        setErrorMessage(error instanceof Error ? error.message : 'AI 여행 생성 중 오류가 발생했습니다.');
        setStatusMessage('AI 여행 생성을 완료하지 못했습니다. 안전한 기본 결과를 확인해 주세요.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [runSingleAiRequest],
  );

  const createSourceTrip = useCallback(
    async (content: string) => {
      const nextContent = content.trim();
      setIsAnalyzing(true);
      setErrorMessage('');
      setStatusMessage('입력한 여행 소스를 분석하고 있습니다.');

      try {
        const inferredSourceType = inferTravelSourceType(nextContent);
        const plan = await runSingleAiRequest(`source-trip:${nextContent}`, () => travelApi.createTripFromSource(nextContent));
        setTrip(plan.trip);
        setSourceType(inferredSourceType);
        setSourceContent(nextContent);
        setDays(plan.days);
        setConnections(plan.connections);
        setSelectedDayId(plan.days[0]?.id ?? 'day-1');
        setHasStarted(true);
        setIsDirty(true);
        setIsSaved(false);
        setCurrentTripId(null);
    setCurrentTripVersion(1);
        setStatusMessage(plan.days.length + `일 일정이 생성되었습니다.`);
        setErrorMessage('');
      } catch (error) {
        console.error('[useTravelPlanner] 소스 여행 생성 실패', error);
        setErrorMessage(error instanceof Error ? error.message : '소스 여행 생성 중 오류가 발생했습니다.');
        setStatusMessage('소스 분석을 완료하지 못했습니다. 안전한 기본 결과를 확인해 주세요.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [runSingleAiRequest],
  );

  const addDay = useCallback(() => {
    const fallbackRegion = selectedDay?.region ?? selectedDay?.city ?? trip.city;
    const nextDay = {
      id: createId('day'),
      dayNumber: days.length + 1,
      title: getNextDayTitle(days),
      city: (selectedDay?.city ?? trip.city) || undefined,
      region: fallbackRegion || undefined,
      blocks: [],
    };

    setDays((currentDays) => renumberDays([...currentDays, nextDay]));
    setSelectedDayId(nextDay.id);
    markDirty();
    setStatusMessage(`${nextDay.title}가 추가되었습니다.`);
    setErrorMessage('');
  }, [days, markDirty, selectedDay, trip.city]);

  const deleteDay = useCallback(
    (dayId: string) => {
      try {
        if (days.length <= 1) {
          throw new Error('Day는 최소 1개 이상 필요합니다.');
        }

        const deletingDay = days.find((day) => day.id === dayId);
        const nextDays = renumberDays(days.filter((day) => day.id !== dayId));

        setDays(nextDays);
        setConnections((currentConnections) => currentConnections.filter((connection) => connection.dayId !== dayId));
        if (selectedDayId === dayId) {
          setSelectedDayId(nextDays[0]?.id ?? 'day-1');
        }
        markDirty();
        setStatusMessage(`${deletingDay?.title ?? 'Day'}가 삭제되었습니다.`);
        setErrorMessage('');
      } catch (error) {
        console.error('[useTravelPlanner] Day 삭제 실패', error);
        setErrorMessage(error instanceof Error ? error.message : 'Day 삭제 중 오류가 발생했습니다.');
      }
    },
    [days, markDirty, selectedDayId],
  );

  const renameDay = useCallback((dayId: string, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      setErrorMessage('Day 이름은 비워둘 수 없습니다.');
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              title: nextTitle,
            }
          : day,
      ),
    );
    markDirty();
    setStatusMessage(`${nextTitle}로 Day 이름을 변경했습니다.`);
    setErrorMessage('');
  }, [markDirty]);

  const startDayDrag = useCallback((dayId: string) => {
    setDayDragId(dayId);
  }, []);

  const dropDay = useCallback(
    (targetDayId: string) => {
      if (!dayDragId) {
        return;
      }

      setDays((currentDays) => moveDayById(currentDays, dayDragId, targetDayId));
      setSelectedDayId(dayDragId);
      setDayDragId(null);
      markDirty();
      setStatusMessage('Day 순서를 변경했습니다.');
      setErrorMessage('');
    },
    [dayDragId, markDirty],
  );

  const startDrag = useCallback((nextDragState: DragState) => {
    setDragState(nextDragState);
  }, []);

  const dropOnDay = useCallback(
    (targetDayId: string) => {
      if (!dragState) {
        return;
      }

      setDays((currentDays) => moveBlockBetweenDays(currentDays, dragState, targetDayId));
      setConnections((currentConnections) =>
        currentConnections.filter(
          (connection) =>
            connection.sourceBlockId !== dragState.sourceBlockId && connection.targetBlockId !== dragState.sourceBlockId,
        ),
      );
      setSelectedDayId(targetDayId);
      setDragState(null);
      markDirty();
      setStatusMessage('블록을 이동했습니다.');
      setErrorMessage('');
    },
    [dragState, markDirty],
  );

  const dropOnBlock = useCallback(
    (targetDayId: string, targetBlockId: string) => {
      if (!dragState) {
        return;
      }

      setDays((currentDays) => reorderBlockInDay(currentDays, dragState, targetDayId, targetBlockId));
      setDragState(null);
      markDirty();
      setStatusMessage('블록 순서를 변경했습니다.');
      setErrorMessage('');
    },
    [dragState, markDirty],
  );

  const addBlock = useCallback((dayId: string, block: Omit<TravelBlock, 'id'>) => {
    try {
      const nextBlock = {
        ...block,
        id: createId('block'),
      };

      setDays((currentDays) =>
        currentDays.map((day) =>
          day.id === dayId
            ? {
                ...day,
                blocks: [...day.blocks, nextBlock],
              }
            : day,
        ),
      );
      setSelectedDayId(dayId);
      markDirty();
      setStatusMessage(`${nextBlock.title} 블록을 추가했습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 블록 추가 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '블록 추가 중 오류가 발생했습니다.');
    }
  }, [markDirty]);

  const updateBlock = useCallback((dayId: string, block: TravelBlock) => {
    try {
      if (!block.title.trim()) {
        throw new Error('블록 제목은 반드시 입력해야 합니다.');
      }

      setDays((currentDays) => {
        const existsInTargetDay = currentDays
          .find((day) => day.id === dayId)
          ?.blocks.some((currentBlock) => currentBlock.id === block.id);

        return currentDays.map((day) => {
          const blocksWithoutTarget = day.blocks.filter((currentBlock) => currentBlock.id !== block.id);

          if (day.id !== dayId) {
            return {
              ...day,
              blocks: blocksWithoutTarget,
            };
          }

          return {
            ...day,
            blocks: existsInTargetDay
              ? day.blocks.map((currentBlock) => (currentBlock.id === block.id ? block : currentBlock))
              : [...blocksWithoutTarget, block],
          };
        });
      });
      markDirty();
      setStatusMessage(`${block.title} 블록을 수정했습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 블록 수정 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '블록 수정 중 오류가 발생했습니다.');
    }
  }, [markDirty]);

  const deleteBlock = useCallback((dayId: string, blockId: string) => {
    const deletingBlock = findBlock(days, dayId, blockId);

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              blocks: day.blocks.filter((block) => block.id !== blockId),
            }
          : day,
      ),
    );
    setConnections((currentConnections) =>
      currentConnections.filter(
        (connection) => connection.sourceBlockId !== blockId && connection.targetBlockId !== blockId,
      ),
    );
    markDirty();
    setStatusMessage(`${deletingBlock?.title ?? '블록'}을 삭제했습니다.`);
    setErrorMessage('');
  }, [days, markDirty]);

  const copyBlock = useCallback((dayId: string, blockId: string) => {
    try {
      const sourceBlock = findBlock(days, dayId, blockId);

      if (!sourceBlock) {
        throw new Error('복사할 블록을 찾을 수 없습니다.');
      }

      const copiedBlock = {
        ...sourceBlock,
        id: createId('block-copy'),
        title: `${sourceBlock.title} 복사본`,
      };

      setDays((currentDays) =>
        currentDays.map((day) =>
          day.id === dayId
            ? {
                ...day,
                blocks: [...day.blocks, copiedBlock],
              }
            : day,
        ),
      );
      setSelectedDayId(dayId);
      markDirty();
      setStatusMessage(`${sourceBlock.title} 블록을 복사했습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 블록 복사 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '블록 복사 중 오류가 발생했습니다.');
    }
  }, [days, markDirty]);

  const moveBlockToDay = useCallback((sourceDayId: string, blockId: string, targetDayId: string) => {
    try {
      if (sourceDayId === targetDayId) {
        return;
      }

      const movingBlock = findBlock(days, sourceDayId, blockId);
      const targetDay = days.find((day) => day.id === targetDayId);

      if (!movingBlock || !targetDay) {
        throw new Error('이동할 블록 또는 대상 Day를 찾을 수 없습니다.');
      }

      setDays((currentDays) =>
        currentDays.map((day) => {
          if (day.id === sourceDayId) {
            return {
              ...day,
              blocks: day.blocks.filter((block) => block.id !== blockId),
            };
          }

          if (day.id === targetDayId) {
            return {
              ...day,
              blocks: [...day.blocks, movingBlock],
            };
          }

          return day;
        }),
      );
      setConnections((currentConnections) =>
        currentConnections.filter(
          (connection) => connection.sourceBlockId !== blockId && connection.targetBlockId !== blockId,
        ),
      );
      setSelectedDayId(targetDayId);
      markDirty();
      setStatusMessage(`${movingBlock.title} 블록을 ${targetDay.title}로 이동했습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 블록 Day 이동 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '블록 이동 중 오류가 발생했습니다.');
    }
  }, [days, markDirty]);

  const addConnection = useCallback((dayId: string, sourceBlockId: string, targetBlockId: string) => {
    try {
      const day = days.find((currentDay) => currentDay.id === dayId);
      const sourceBlock = day?.blocks.find((block) => block.id === sourceBlockId);
      const targetBlock = day?.blocks.find((block) => block.id === targetBlockId);
      const validation = validateConnection(sourceBlock, targetBlock, day?.blocks ?? [], connections, dayId);

      if (!validation.ok) {
        throw new Error(validation.reason ?? '블록을 연결할 수 없습니다.');
      }

      if (!day || !sourceBlock || !targetBlock) {
        throw new Error('연결할 블록을 찾을 수 없습니다.');
      }

      const nextConnection: TravelConnection = {
        id: createId('connection'),
        dayId,
        sourceBlockId,
        targetBlockId,
        transportMode: 'walk',
        duration: '',
      };

      setConnections((currentConnections) => [...currentConnections, nextConnection]);
      markDirty();
      setStatusMessage(`${sourceBlock.title}에서 ${targetBlock.title}로 연결했습니다.`);
      setErrorMessage('');
    } catch (error) {
      console.error('[useTravelPlanner] 블록 연결 실패', error);
      setErrorMessage(error instanceof Error ? error.message : '블록 연결 중 오류가 발생했습니다.');
    }
  }, [connections, days, markDirty]);

  const updateConnection = useCallback((connectionId: string, patch: Partial<Pick<TravelConnection, 'transportMode' | 'duration'>>) => {
    setConnections((currentConnections) =>
      currentConnections.map((connection) =>
        connection.id === connectionId
          ? {
              ...connection,
              ...patch,
            }
          : connection,
      ),
    );
    markDirty();
    setStatusMessage('연결선 정보를 수정했습니다.');
    setErrorMessage('');
  }, [markDirty]);

  const deleteConnection = useCallback((connectionId: string) => {
    setConnections((currentConnections) => currentConnections.filter((connection) => connection.id !== connectionId));
    markDirty();
    setStatusMessage('연결선을 삭제했습니다.');
    setErrorMessage('');
  }, [markDirty]);

  const addRecommendedBlock = useCallback(
    (block: TravelBlock) => {
      try {
        const targetDayId = selectedDay?.id ?? days[0]?.id;

        if (!targetDayId) {
          throw new Error('먼저 일정을 분석해 Day를 생성해 주세요.');
        }

        const nextBlock = {
          ...block,
          id: createId('recommend-added'),
        };

        setDays((currentDays) =>
          currentDays.map((day) =>
            day.id === targetDayId
              ? {
                  ...day,
                  blocks: [...day.blocks, nextBlock],
                }
              : day,
          ),
        );
        setSelectedDayId(targetDayId);
        markDirty();
        setStatusMessage(`${nextBlock.title} 블록을 ${selectedDay?.title ?? 'Day 1'}에 추가했습니다.`);
        setErrorMessage('');
      } catch (error) {
        console.error('[useTravelPlanner] 추천 블록 추가 실패', error);
        setErrorMessage(error instanceof Error ? error.message : '추천 블록 추가 중 오류가 발생했습니다.');
      }
    },
    [days, markDirty, selectedDay],
  );

  const loadSavedPlans = useCallback(() => travelApi.loadTrips(), []);

  const loadRecommendations = useCallback(async () => {
    if (!hasStarted || !selectedDay) {
      setRecommendations([]);
      return;
    }

    try {
      const nextRecommendations = await travelApi.getRecommendations(trip, selectedDay);
      setRecommendations(nextRecommendations);
    } catch (error) {
      console.error('[useTravelPlanner] 추천 조회 실패', error);
      setRecommendations([]);
    }
  }, [hasStarted, selectedDay, trip]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  return {
    trip,
    hasStarted,
    sourceType,
    sourceContent,
    days,
    connections,
    selectedDayId,
    selectedDay,
    isAnalyzing,
    statusMessage,
    errorMessage,
    isDirty,
    isSaved,
    currentTripId,
    hasUnsavedChanges: isDirty,
    recommendations,
    setSourceType,
    setSourceContent,
    setSelectedDayId,
    saveTrip,
    saveCurrentPlan,
    resetPlanner,
    loadSavedPlan,
    loadSavedPlans,
    createManualTrip,
    createAiTrip,
    createSourceTrip,
    analyze,
    addDay,
    deleteDay,
    renameDay,
    startDayDrag,
    dropDay,
    addBlock,
    updateBlock,
    deleteBlock,
    copyBlock,
    moveBlockToDay,
    addConnection,
    updateConnection,
    deleteConnection,
    startDrag,
    dropOnDay,
    dropOnBlock,
    addRecommendedBlock,
  };
}
