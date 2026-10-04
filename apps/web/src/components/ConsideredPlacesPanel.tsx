import { CheckCircle2, CircleAlert, CircleHelp, Info, MapPin, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConsideredPlaceItem, ConsideredPlacesViewModel } from '../features/consideredPlaces/model';
import type { DecisionReviewState } from '../hooks/useDecisionReview';

interface ConsideredPlacesPanelProps {
  model: ConsideredPlacesViewModel;
}

export function ConsideredPlacesPanel({ model }: ConsideredPlacesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="considered-places-title" data-testid="considered-places-panel">
      <p className="text-xs font-bold uppercase text-myrealtrip-blue">Decision review</p>
      <h2 id="considered-places-title" className="mt-1 text-base font-bold text-slate-950">
        일정 생성 과정에서 함께 검토한 장소
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        일정에 포함된 장소뿐 아니라, 조건과 확인된 정보에 따라 제외되거나 판단을 보류한 후보도 확인할 수 있어요.
      </p>
      <p className="mt-3 inline-flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700" aria-label={model.coverage.ariaLabel}>
        <Info size={16} className="mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
        {model.coverage.text}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600" aria-label={model.judge.ariaLabel}>{model.judge.text}</p>

      <div className="mt-4 space-y-5">
        <DecisionSection title="일정에 포함할 장소" count={model.counts.selected} icon={<CheckCircle2 size={18} aria-hidden="true" className="text-teal-700" />} items={model.selected} />
        <DecisionSection title="다른 후보" count={model.counts.rejected} icon={<XCircle size={18} aria-hidden="true" className="text-amber-700" />} items={model.rejected} />
        <DecisionSection title="확인이 필요한 후보" count={model.counts.unresolved} icon={<CircleAlert size={18} aria-hidden="true" className="text-slate-700" />} items={model.unresolved} />
      </div>
    </section>
  );
}

function DecisionSection({ title, count, icon, items }: { title: string; count: number; icon: ReactNode; items: readonly ConsideredPlaceItem[] }) {
  return (
    <section aria-label={`${title} ${count}개`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {icon}
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{count}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">해당하는 장소가 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => <DecisionCard key={`${item.status}-${item.displayName}`} item={item} />)}
        </ul>
      )}
    </section>
  );
}

function DecisionCard({ item }: { item: ConsideredPlaceItem }) {
  return (
    <li className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{item.categoryLabel}</span>
        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">{item.statusLabel}</span>
      </div>
      <h4 className="mt-2 break-words text-sm font-bold text-slate-950">{item.displayName}</h4>
      <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-700">
        <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>{item.reason.title}</strong> {item.reason.description}</span>
      </p>
    </li>
  );
}

export function ConsideredPlacesLoading() {
  return <p className="text-sm text-slate-700" role="status" aria-live="polite">장소 후보를 확인하고 있어요.</p>;
}

export function ConsideredPlacesEmpty() {
  return <p className="text-sm text-slate-600">함께 검토할 장소 후보가 아직 없습니다.</p>;
}

export function ConsideredPlacesError({ message = '장소 검토 결과를 만들지 못했습니다.', retryable, onRetry }: { message?: string; retryable: boolean; onRetry?: () => void }) {
  return (
    <div role="alert" aria-live="polite" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <p>{message}</p>
      {retryable && onRetry ? <button type="button" onClick={onRetry} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 text-sm font-bold text-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">다시 시도</button> : null}
    </div>
  );
}

export function ConsideredPlacesNotReady() {
  return <p className="flex items-center gap-2 text-sm text-slate-600"><CircleHelp size={16} aria-hidden="true" /> 함께 검토할 장소 후보가 아직 없습니다.</p>;
}

export function ConsideredPlacesReviewControl({ state, onReview, onRetry }: { state: DecisionReviewState; onReview: () => void; onRetry: () => void }) {
  const loading = state.status === 'discovering_candidates' || state.status === 'evaluating_decision';
  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50 p-4" aria-label="장소 후보 검토">
      {state.status === 'success' ? <ConsideredPlacesPanel model={state.result} /> : null}
      {state.status === 'discovering_candidates' ? <p role="status" aria-live="polite" className="text-sm text-slate-700">장소 후보를 불러오고 있어요.</p> : null}
      {state.status === 'evaluating_decision' ? <ConsideredPlacesLoading /> : null}
      {state.status === 'empty' ? <ConsideredPlacesEmpty /> : null}
      {state.status === 'error' ? <ConsideredPlacesError message={state.stage === 'discovery' ? '장소 후보를 불러오지 못했습니다.' : state.error.message} retryable={state.error.retryable} onRetry={onRetry} /> : null}
      {state.status !== 'success' ? (
        <button
          type="button"
          data-testid="review-candidates-button"
          onClick={onReview}
          disabled={loading}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-myrealtrip-blue px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-myrealtrip-blue"
        >
          {loading ? '장소 후보를 검토하고 있어요.' : '장소 후보 검토하기'}
        </button>
      ) : null}
    </section>
  );
}
