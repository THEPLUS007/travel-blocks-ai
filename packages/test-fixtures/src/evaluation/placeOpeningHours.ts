import type { PlaceOpeningHoursSnapshot } from '@travel-blocks/domain';
export function evaluationOpeningHoursForScenario(scenarioId: string, durationDays: number): Record<string, PlaceOpeningHoursSnapshot> {
  const result: Record<string, PlaceOpeningHoursSnapshot> = {};
  for (let index = 1; index <= durationDays * 3; index += 1) {
    const providerPlaceId = `${scenarioId.toLowerCase()}-place-${index}`;
    result[`fixture:${providerPlaceId}`] = { provider: 'fixture', providerPlaceId, source: 'evaluation_fixture', retrievedAt: '2026-01-01T00:00:00.000Z', businessStatus: 'operational', timeZone: 'Asia/Seoul', currentHours: { coverageStart: '2026-10-10', coverageEnd: '2026-10-31', periods: Array.from({ length: 7 }, (_, day) => ({ openDay: day, openTime: '08:00', closeDay: day, closeTime: '20:00' })) }, dataQualityFlags: [] };
  }
  return result;
}
