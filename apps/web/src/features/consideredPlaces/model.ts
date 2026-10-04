import type {
  DecisionApiResponseV1,
  DecisionCoverageStatus,
  DecisionJudgeSkipReason,
  DecisionReasonCode,
} from '@travel-blocks/decision-api-contract';
import { parseDecisionApiResponseV1 } from '@travel-blocks/decision-api-contract';
import { CATEGORY_LABELS } from '../../constants/travel';
import type { TravelBlockCategory } from '../../types/travel';

export type ConsideredPlaceStatus = 'selected' | 'rejected' | 'unresolved';

export interface UserFacingReasonCopy {
  readonly title: string;
  readonly description: string;
}

export const REASON_COPY = {
  candidate_selected: { title: '일정 기준에 맞는 후보예요.', description: '확인된 정보와 일정 조건을 기준으로 포함했어요.' },
  ai_assisted_selection: { title: '선호 조건을 함께 반영했어요.', description: '입력한 선호 조건을 후보 비교에 반영해 포함했어요.' },
  hard_constraint: { title: '운영 종료가 확인됐어요.', description: '운영 종료가 확인되어 이번 일정에서 제외했어요.' },
  selection_limit: { title: '일정에 포함할 수 있는 수를 고려했어요.', description: '이번 일정에 포함할 수 있는 장소 수를 고려해 다른 후보를 우선했어요.' },
  selection_threshold: { title: '다른 후보를 우선했어요.', description: '요청한 조건과의 적합도를 기준으로 다른 후보를 우선했어요.' },
  ai_assisted_not_selected: { title: '다른 후보를 우선했어요.', description: '입력한 선호 조건을 함께 비교한 결과 다른 후보가 우선됐어요.' },
  missing_required_facts: { title: '추가 확인이 필요해요.', description: '판단에 필요한 정보가 부족해 추가 확인이 필요해요.' },
  fact_unavailable: { title: '정보를 불러오지 못했어요.', description: '현재 필요한 정보를 불러오지 못해 추가 확인이 필요해요.' },
  fact_untrusted: { title: '정보를 다시 확인해야 해요.', description: '확인된 정보가 서로 달라 추가 확인이 필요해요.' },
  ai_judge_required: { title: '추가 비교가 필요해요.', description: '안전하게 정리하려면 추가 비교가 필요해요.' },
  ai_judge_unavailable: { title: '추가 비교를 완료하지 못했어요.', description: '안전하게 정리하려면 추가 확인이 필요해요.' },
  policy_not_executed: { title: '판단을 보류했어요.', description: '현재 확인 가능한 정보만으로는 안전하게 판단하기 어려워요.' },
} satisfies Record<DecisionReasonCode, UserFacingReasonCopy>;

export const COVERAGE_COPY = {
  complete: '후보 정보를 모두 확인했어요.',
  partial: '일부 정보가 없어 확인 가능한 범위에서 판단했어요.',
  unknown: '일부 후보의 정보 확인 상태를 알 수 없어요.',
  unavailable: '필요한 정보를 불러오지 못해 일부 판단을 보류했어요.',
} satisfies Record<DecisionCoverageStatus, string>;

export const JUDGE_SKIP_COPY = {
  disabled: '확인된 정보와 기본 일정 기준으로 정리했어요.',
  no_preference_signal: '별도 선호 조건 없이 기본 일정 기준으로 정리했어요.',
  insufficient_candidates: '비교할 후보가 충분하지 않아 기본 기준을 사용했어요.',
  no_eligible_candidates: '추가 비교가 가능한 후보가 없어 기본 기준을 사용했어요.',
  no_eligible_provider: '추가 선호 비교 없이 기본 기준으로 정리했어요.',
} satisfies Record<DecisionJudgeSkipReason, string>;

export interface ConsideredPlaceItem {
  readonly displayName: string;
  readonly categoryLabel: string;
  readonly status: ConsideredPlaceStatus;
  readonly statusLabel: string;
  readonly reason: UserFacingReasonCopy;
}

export interface ConsideredPlacesViewModel {
  readonly counts: Readonly<Record<ConsideredPlaceStatus, number>>;
  readonly selected: readonly ConsideredPlaceItem[];
  readonly rejected: readonly ConsideredPlaceItem[];
  readonly unresolved: readonly ConsideredPlaceItem[];
  readonly coverage: { readonly text: string; readonly ariaLabel: string };
  readonly judge: { readonly text: string; readonly ariaLabel: string };
}

export class ConsideredPlacesIntegrityError extends Error {
  constructor() {
    super('Decision result cannot be safely displayed.');
    this.name = 'ConsideredPlacesIntegrityError';
  }
}

const STATUS_LABEL: Record<ConsideredPlaceStatus, string> = {
  selected: '일정에 포함할 장소',
  rejected: '이번 일정에서는 제외',
  unresolved: '정보 확인 필요',
};

/**
 * Converts the validated public result into DOM-safe display data. It retains
 * only name, category label, state, and curated copy; IDs and raw payload stay
 * outside the view model.
 */
export function createConsideredPlacesViewModel(input: unknown): ConsideredPlacesViewModel {
  let response: DecisionApiResponseV1;
  try {
    response = parseDecisionApiResponseV1(input);
  } catch {
    throw new ConsideredPlacesIntegrityError();
  }

  const candidates = new Map(response.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const buckets: Record<ConsideredPlaceStatus, ConsideredPlaceItem[]> = { selected: [], rejected: [], unresolved: [] };

  for (const decision of response.decisionResult.decisions) {
    const candidate = candidates.get(decision.candidateId);
    if (!candidate) {
      throw new ConsideredPlacesIntegrityError();
    }
    const status = decision.status;
    buckets[status].push({
      displayName: candidate.displayName,
      categoryLabel: CATEGORY_LABELS[candidate.category as TravelBlockCategory],
      status,
      statusLabel: STATUS_LABEL[status],
      reason: REASON_COPY[decision.reason.code],
    });
  }

  const judge = response.judge.outcome === 'applied'
    ? { text: '입력한 선호 조건을 후보 비교에 반영했어요.', ariaLabel: '선호 조건 비교가 반영됨' }
    : { text: JUDGE_SKIP_COPY[response.judge.reason], ariaLabel: '기본 일정 기준으로 정리됨' };

  return {
    counts: {
      selected: buckets.selected.length,
      rejected: buckets.rejected.length,
      unresolved: buckets.unresolved.length,
    },
    selected: buckets.selected,
    rejected: buckets.rejected,
    unresolved: buckets.unresolved,
    coverage: { text: COVERAGE_COPY[response.coverage.status], ariaLabel: `후보 정보 확인 범위: ${COVERAGE_COPY[response.coverage.status]}` },
    judge,
  };
}
