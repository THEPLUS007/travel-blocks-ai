import {
  detectMockUrlProvider,
  mockCityRecommendations,
  mockCityTravelDays,
  mockRegionRecommendations,
  mockCityTrips,
  mockSavedTravelPlans,
  resolveMockCityFromContent,
  type MockTravelCity,
} from '../mock/travelTestData';
import type { SavedTravelPlan, TravelAnalysisInput, TravelBlock, TravelConnection, TravelDay, TripFormData } from '../types/travel';

export interface TravelPlanPayload {
  trip: TripFormData;
  days: TravelDay[];
  connections: TravelConnection[];
}

const CURRENT_TRIP_STORAGE_KEY = 'travel-blocks-current-trip';

function cloneDays(days: TravelDay[]): TravelDay[] {
  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => ({ ...block })),
  }));
}

function cloneConnections(connections: TravelConnection[] = []): TravelConnection[] {
  return connections.map((connection) => ({ ...connection }));
}

function clonePlan(plan: SavedTravelPlan): SavedTravelPlan {
  return {
    ...plan,
    trip: { ...plan.trip },
    days: cloneDays(plan.days),
    connections: cloneConnections(plan.connections),
  };
}

function cloneTrip(city: MockTravelCity, content: string, mode: 'ai' | 'source'): TripFormData {
  const baseTrip = mockCityTrips[city];
  const durationFromPrompt = content.match(/\d+\s*박\s*\d+\s*일/)?.[0];
  const provider = detectMockUrlProvider(content);

  return {
    ...baseTrip,
    name: mode === 'source' && provider ? `${baseTrip.city} ${providerLabel(provider)} 분석 여행` : baseTrip.name,
    duration: durationFromPrompt ?? baseTrip.duration,
    description: content.trim() || baseTrip.description,
  };
}

function providerLabel(provider: NonNullable<ReturnType<typeof detectMockUrlProvider>>): string {
  const labels: Record<typeof provider, string> = {
    youtube: 'YouTube',
    'naver-mobile': '네이버 모바일 블로그',
    'naver-pc': '네이버 PC 블로그',
    tistory: '티스토리 블로그',
  };

  return labels[provider];
}

function resolveMockCityFromTrip(trip?: TripFormData, day?: TravelDay): MockTravelCity {
  const content = [trip?.city, trip?.name, trip?.style, trip?.description, day?.city, day?.region, day?.title, day?.blocks.map((block) => `${block.title} ${block.location ?? ''}`).join(' ')].filter(Boolean).join(' ');
  return resolveMockCityFromContent(content);
}

function normalizeRecommendationScope(scope?: string): string {
  return (scope ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function findExactRegionRecommendations(scope?: string): TravelBlock[] {
  const normalizedScope = normalizeRecommendationScope(scope);

  if (!normalizedScope) {
    return [];
  }

  const matchedEntry = Object.entries(mockRegionRecommendations).find(
    ([region]) => normalizeRecommendationScope(region) === normalizedScope,
  );

  return matchedEntry?.[1] ?? [];
}

function uniqueBlocks(blocks: TravelBlock[]): TravelBlock[] {
  return blocks.filter(
    (block, index, currentBlocks) => currentBlocks.findIndex((currentBlock) => currentBlock.id === block.id) === index,
  );
}

function readCurrentSavedPlan(): SavedTravelPlan | null {
  try {
    const rawPayload = window.localStorage.getItem(CURRENT_TRIP_STORAGE_KEY);
    if (!rawPayload) {
      return null;
    }

    const payload = JSON.parse(rawPayload) as TravelPlanPayload;
    return {
      id: 'saved-current-local',
      title: payload.trip.name || '저장된 여행 일정',
      subtitle: [payload.trip.duration, payload.trip.style].filter(Boolean).join(' · ') || '로컬 저장 일정',
      trip: payload.trip,
      days: payload.days,
      connections: payload.connections,
    };
  } catch (error) {
    console.warn('[mockTravelApi] localStorage 일정 조회 실패', error);
    return null;
  }
}

export async function createTripFromForm(input: TripFormData): Promise<TravelPlanPayload> {
  return {
    trip: { ...input },
    days: [
      {
        id: `day-${Date.now()}`,
        dayNumber: 1,
        title: 'Day 1',
        city: input.city || undefined,
        region: input.city || undefined,
        blocks: [],
      },
    ],
    connections: [],
  };
}

export async function generateTripWithAI(prompt: string): Promise<TravelPlanPayload> {
  if (!prompt.trim()) {
    throw new Error('여행 요청 내용을 입력해 주세요.');
  }

  await new Promise((resolve) => window.setTimeout(resolve, 600));

  const city = resolveMockCityFromContent(prompt);
  return {
    trip: cloneTrip(city, prompt, 'ai'),
    days: cloneDays(mockCityTravelDays[city]),
    connections: [],
  };
}

export async function analyzeLinkOrText(input: TravelAnalysisInput): Promise<TravelDay[]> {
  if (!input.content.trim()) {
    throw new Error('분석할 링크 또는 여행 일정 텍스트를 입력해 주세요.');
  }

  await new Promise((resolve) => window.setTimeout(resolve, 600));

  const city = resolveMockCityFromContent(input.content);
  return cloneDays(mockCityTravelDays[city]);
}

export async function createTripFromSource(content: string): Promise<TravelPlanPayload> {
  if (!content.trim()) {
    throw new Error('분석할 링크 또는 여행 일정 텍스트를 입력해 주세요.');
  }

  const city = resolveMockCityFromContent(content);
  return {
    trip: cloneTrip(city, content, 'source'),
    days: await analyzeLinkOrText({ sourceType: detectMockUrlProvider(content) === 'youtube' ? 'youtube' : detectMockUrlProvider(content) ? 'blog' : 'text', content }),
    connections: [],
  };
}

export async function getRecommendations(trip?: TripFormData, day?: TravelDay): Promise<TravelBlock[]> {
  const city = resolveMockCityFromTrip(trip, day);
  const regionRecommendations = findExactRegionRecommendations(day?.region);
  const dayCityRecommendations = findExactRegionRecommendations(day?.city);
  const tripCityRecommendations = findExactRegionRecommendations(trip?.city);
  const recommendations =
    regionRecommendations.length > 0
      ? regionRecommendations
      : dayCityRecommendations.length > 0
        ? dayCityRecommendations
        : tripCityRecommendations.length > 0
          ? tripCityRecommendations
          : mockCityRecommendations[city];

  return uniqueBlocks(recommendations).map((block) => ({ ...block }));
}

export async function saveTrip(payload: TravelPlanPayload): Promise<{ ok: true }> {
  try {
    window.localStorage.setItem(CURRENT_TRIP_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[mockTravelApi] localStorage 저장 실패', error);
  }

  return { ok: true };
}

export async function loadTrips(): Promise<SavedTravelPlan[]> {
  const currentPlan = readCurrentSavedPlan();
  const plans: SavedTravelPlan[] = [];
  return currentPlan ? [clonePlan(currentPlan), ...plans] : plans;
}

export async function loadTrip(tripId: string): Promise<SavedTravelPlan | null> {
  const currentPlan = readCurrentSavedPlan();
  if (currentPlan?.id === tripId) {
    return clonePlan(currentPlan);
  }

  const plan = mockSavedTravelPlans.find((currentSavedPlan) => currentSavedPlan.id === tripId);
  return plan ? clonePlan(plan) : null;
}
