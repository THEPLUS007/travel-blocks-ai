import { describe, expect, it } from 'vitest';
import type { RecommendationInput, VerifiedPlace } from '@travel-blocks/shared';
import { fixturePlan, TestPlaceProvider } from '@travel-blocks/test-fixtures';
import { buildPlaceRankingInput, retrievePlaceCandidates, selectedPlacesToBlocks } from '../src/recommendations.js';

const input: RecommendationInput = { trip: fixturePlan.trip, day: fixturePlan.days[0], existingPlaces: [] };

describe('retrieval-first recommendations', () => {
  it('서버가 provider 후보를 검색하고 provider ID로 중복 제거한다', async () => {
    const candidates = await retrievePlaceCandidates(new TestPlaceProvider(), input);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({ candidateId: 'test:namsan', name: '남산서울타워' });
    expect(buildPlaceRankingInput(input, candidates).candidates).toEqual(candidates);
  });

  it('기존 장소를 후보에서 제외한다', async () => {
    const withExisting = { ...input, existingPlaces: [{ id: 'x', title: '기존', category: 'sightseeing' as const, priceLevel: 'low' as const, place: { provider: 'test', providerPlaceId: 'namsan', verified: true as const } }] };
    expect(await retrievePlaceCandidates(new TestPlaceProvider(), withExisting)).toHaveLength(2);
  });

  it('AI 선택을 factual provider data와 합성하고 unknown ID는 생성하지 않는다', () => {
    const candidate: VerifiedPlace & { candidateId: string } = { provider: 'google', providerPlaceId: 'g1', candidateId: 'google:g1', name: '실제 장소', formattedAddress: '실제 주소', latitude: 1, longitude: 2, category: 'food', city: '서울', region: '' };
    const blocks = selectedPlacesToBlocks([candidate], { selections: [{ candidateId: 'google:g1', reason: '일정과 잘 맞음' }, { candidateId: 'invented', reason: '가짜' }] });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ title: '실제 장소', category: 'food', location: '실제 주소', memo: '일정과 잘 맞음', place: { provider: 'google', providerPlaceId: 'g1', verified: true } });
  });
});
