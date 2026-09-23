/** Future-work-only fixtures for a bounded candidate decision experiment.
 * They contain supplied facts and opaque candidate IDs only; no place identity is present. */
export interface BoundedDecisionFixture {
  readonly id: string;
  readonly candidates: readonly { readonly candidateId: string; readonly price: number; readonly open: boolean; readonly travelMinutes: number; readonly timeConflict: boolean; readonly tags: readonly string[] }[];
  readonly expectedCandidateIds: readonly string[];
}

export const BOUNDED_DECISION_FIXTURES: readonly BoundedDecisionFixture[] = [
  { id: 'JEV-001', candidates: [{ candidateId: 'c-a', price: 20, open: true, travelMinutes: 12, timeConflict: false, tags: ['food'] }, { candidateId: 'c-b', price: 50, open: true, travelMinutes: 40, timeConflict: false, tags: ['food'] }], expectedCandidateIds: ['c-a', 'c-b'] },
  { id: 'JEV-002', candidates: [{ candidateId: 'c-a', price: 0, open: false, travelMinutes: 5, timeConflict: false, tags: ['cafe'] }, { candidateId: 'c-b', price: 10, open: true, travelMinutes: 18, timeConflict: false, tags: ['cafe'] }], expectedCandidateIds: ['c-a', 'c-b'] },
  { id: 'JEV-003', candidates: [{ candidateId: 'c-a', price: 30, open: true, travelMinutes: 10, timeConflict: true, tags: ['sightseeing'] }], expectedCandidateIds: ['c-a'] },
  { id: 'JEV-004', candidates: [{ candidateId: 'c-a', price: 15, open: true, travelMinutes: 25, timeConflict: false, tags: ['quiet'] }, { candidateId: 'c-b', price: 15, open: true, travelMinutes: 25, timeConflict: false, tags: ['quiet'] }], expectedCandidateIds: ['c-a', 'c-b'] },
  { id: 'JEV-005', candidates: [{ candidateId: 'c-a', price: 99, open: true, travelMinutes: 8, timeConflict: false, tags: ['food'] }], expectedCandidateIds: ['c-a'] },
  { id: 'JEV-006', candidates: [{ candidateId: 'c-a', price: 12, open: true, travelMinutes: 70, timeConflict: false, tags: ['activity'] }, { candidateId: 'c-b', price: 12, open: true, travelMinutes: 20, timeConflict: false, tags: ['activity'] }], expectedCandidateIds: ['c-a', 'c-b'] },
];
