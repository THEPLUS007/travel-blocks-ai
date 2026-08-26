import { ArrowLeft, Link2, Plus, Save, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { DayBoard } from '../components/DayBoard';
import { ExportMenu } from '../components/ExportMenu';
import { Header } from '../components/Header';
import { Onboarding } from '../components/Onboarding';
import { RecommendationPanel } from '../components/RecommendationPanel';
import { StatusBanner } from '../components/StatusBanner';
import { TripForm } from '../components/TripForm';
import { useTravelPlanner } from '../hooks/useTravelPlanner';
import type { SavedTravelPlan, TripFormData } from '../types/travel';
type ScreenMode = 'loading' | 'onboarding' | 'list' | 'editor';
type ActiveModal = 'trip' | 'analysis' | 'recommendations' | null;

export function TravelPlannerPage() {
  const planner = useTravelPlanner();
  const { hasStarted, loadSavedPlans, saveCurrentPlan } = planner;
  const [screen, setScreen] = useState<ScreenMode>('loading');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isLeavePromptOpen, setIsLeavePromptOpen] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedTravelPlan[]>([]);

  const refreshSavedPlans = useCallback(async () => {
    const plans = await loadSavedPlans();
    setSavedPlans(plans);
    return plans;
  }, [loadSavedPlans]);

  useEffect(() => {
    let isMounted = true;

    refreshSavedPlans().then((plans) => {
      if (!isMounted) {
        return;
      }

      setScreen(plans.length > 0 ? 'list' : 'onboarding');
    });

    return () => {
      isMounted = false;
    };
  }, [refreshSavedPlans]);

  useEffect(() => {
    if (hasStarted && screen === 'onboarding') {
      setScreen('editor');
    }
  }, [hasStarted, screen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (hasStarted) {
          void saveCurrentPlan();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, saveCurrentPlan]);

  const openEditorFromPlan = (plan: SavedTravelPlan) => {
    planner.loadSavedPlan(plan);
    setScreen('editor');
  };

  const startNewTrip = () => {
    planner.resetPlanner();
    setScreen('onboarding');
  };

  const goToEntryScreen = async (preferList = false) => {
    const plans = await refreshSavedPlans();
    planner.resetPlanner();
    setScreen(preferList || plans.length > 0 ? 'list' : 'onboarding');
  };

  const requestBack = () => {
    if (planner.isDirty) {
      setIsLeavePromptOpen(true);
      return;
    }

    void goToEntryScreen(planner.isSaved);
  };

  const handleSaveAndLeave = async () => {
    const didSave = await planner.saveCurrentPlan();
    setIsLeavePromptOpen(false);
    await goToEntryScreen(didSave);
  };

  const handleLeaveWithoutSaving = () => {
    setIsLeavePromptOpen(false);
    void goToEntryScreen(planner.isSaved);
  };

  const handleSaveTrip = (trip: TripFormData) => {
    planner.saveTrip(trip);
    setActiveModal(null);
  };

  const handleSaveCurrentPlan = async () => {
    const didSave = await planner.saveCurrentPlan();

    if (didSave) {
      await refreshSavedPlans();
    }
  };

  const handleAnalyze = async () => {
    await planner.analyze();
    setActiveModal(null);
  };

  if (screen === 'loading') {
    return <div className="min-h-screen bg-slate-50" data-testid="entry-loading-screen" />;
  }

  if (screen === 'list') {
    return <SavedPlansScreen plans={savedPlans} onOpenPlan={openEditorFromPlan} onCreateNew={startNewTrip} />;
  }

  if (screen === 'onboarding' && !planner.hasStarted) {
    return (
      <Onboarding
        isAnalyzing={planner.isAnalyzing}
        errorMessage={planner.errorMessage}
        backLabel={savedPlans.length > 0 ? '내 여행 목록으로 돌아가기' : undefined}
        onBack={savedPlans.length > 0 ? () => setScreen('list') : undefined}
        onCreateManualTrip={planner.createManualTrip}
        onCreateAiTrip={planner.createAiTrip}
        onCreateSourceTrip={planner.createSourceTrip}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950" data-testid="trip-editor-screen">
      <Header
        trip={planner.trip}
        actions={<ExportMenu trip={planner.trip} days={planner.days} connections={planner.connections} />}
      />
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-5">
        <aside className="space-y-3 lg:sticky lg:top-5 lg:self-start">
          <button
            type="button"
            data-testid={savedPlans.length > 0 || planner.isSaved ? "exit-trip-button" : "go-home-button"}
            onClick={requestBack}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            처음으로
          </button>

          <TripSummaryCard trip={planner.trip} isDirty={planner.isDirty} onEdit={() => setActiveModal('trip')} />

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Actions</p>
            <div className="mt-3 grid gap-2">
              <ActionButton onClick={() => setActiveModal('analysis')}>
                <Link2 size={16} aria-hidden="true" />
                텍스트 분석
              </ActionButton>
              <ActionButton testId="recommendation-button" onClick={() => setActiveModal('recommendations')}>
                <Sparkles size={16} aria-hidden="true" />
                AI 추천
              </ActionButton>
              <ActionButton primary testId="save-trip-button" onClick={() => void handleSaveCurrentPlan()}>
                <Save size={16} aria-hidden="true" />
                현재 여행 일정 저장
              </ActionButton>
            </div>
          </div>
        </aside>

        <DayBoard
          days={planner.days}
          connections={planner.connections}
          selectedDayId={planner.selectedDayId}
          onSelectDay={planner.setSelectedDayId}
          onAddDay={planner.addDay}
          onDeleteDay={planner.deleteDay}
          onRenameDay={planner.renameDay}
          onDayDragStart={planner.startDayDrag}
          onDropDay={planner.dropDay}
          onAddBlock={planner.addBlock}
          onUpdateBlock={planner.updateBlock}
          onDeleteBlock={planner.deleteBlock}
          onCopyBlock={planner.copyBlock}
          onMoveBlockToDay={planner.moveBlockToDay}
          onAddConnection={planner.addConnection}
          onUpdateConnection={planner.updateConnection}
          onDeleteConnection={planner.deleteConnection}
          onDragStart={(sourceDayId, sourceBlockId) => planner.startDrag({ sourceDayId, sourceBlockId })}
          onDropOnDay={planner.dropOnDay}
          onDropOnBlock={planner.dropOnBlock}
        />
      </main>

      {planner.statusMessage || planner.errorMessage ? (
        <div className="fixed bottom-4 right-4 z-30 w-[min(420px,calc(100vw-2rem))]">
          <StatusBanner statusMessage={planner.statusMessage} errorMessage={planner.errorMessage} />
        </div>
      ) : null}

      {activeModal === 'trip' ? (
        <Modal title="여행 정보 수정" onClose={() => setActiveModal(null)}>
          <TripForm
            initialTrip={planner.trip}
            title="여행 정보"
            description="기본 정보만 적용합니다. 일정 전체 저장은 별도 저장 버튼이나 Ctrl+S를 사용합니다."
            submitLabel="적용"
            onSave={handleSaveTrip}
          />
        </Modal>
      ) : null}

      {activeModal === 'analysis' ? (
        <Modal title="텍스트 분석" onClose={() => setActiveModal(null)}>
          <AnalysisPanel
            sourceContent={planner.sourceContent}
            isAnalyzing={planner.isAnalyzing}
            onSourceContentChange={planner.setSourceContent}
            onAnalyze={handleAnalyze}
          />
        </Modal>
      ) : null}

      {activeModal === 'recommendations' ? (
        <Modal title="AI 추천" onClose={() => setActiveModal(null)}>
          <RecommendationPanel
            recommendations={planner.recommendations}
            selectedDay={planner.selectedDay}
            onAddBlock={planner.addRecommendedBlock}
          />
        </Modal>
      ) : null}

      {isLeavePromptOpen ? (
        <UnsavedChangesModal
          onSaveAndLeave={handleSaveAndLeave}
          onLeaveWithoutSaving={handleLeaveWithoutSaving}
          onCancel={() => setIsLeavePromptOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SavedPlansScreen({
  plans,
  onOpenPlan,
  onCreateNew,
}: {
  plans: SavedTravelPlan[];
  onOpenPlan: (plan: SavedTravelPlan) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950" data-testid="trip-list-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-myrealtrip-blue">Travel Blocks AI</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">여행 일정 목록</h1>
          </div>
          <button
            type="button"
            data-testid="create-new-trip-button"
            onClick={onCreateNew}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-myrealtrip-blue px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} aria-hidden="true" />
            새 여행 일정 생성
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              data-testid="saved-plan-card"
              onClick={() => onOpenPlan(plan)}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-myrealtrip-blue hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase text-myrealtrip-blue">Saved Trip</p>
              <h2 className="mt-2 text-base font-bold text-slate-950">{plan.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{plan.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-md bg-slate-100 px-2 py-1">{plan.trip.duration}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">{plan.trip.travelers}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">{plan.days.length} Days</span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function TripSummaryCard({ trip, isDirty, onEdit }: { trip: TripFormData; isDirty: boolean; onEdit: () => void }) {
  const summaryItems = [
    ['도시/국가', [trip.country, trip.city].filter(Boolean).join(' · ') || '-'],
    ['기간', trip.duration || '-'],
    ['예산', trip.budget || '-'],
    ['인원', trip.travelers || '-'],
    ['스타일', trip.style || '-'],
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase text-myrealtrip-blue">Trip</p>
            {isDirty ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">미저장</span> : null}
          </div>
          <h2 className="mt-1 truncate text-base font-bold text-slate-950">{trip.name || '새 여행'}</h2>
        </div>

      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {summaryItems.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
            <dt className="shrink-0 text-xs font-semibold text-slate-500">{label}</dt>
            <dd className="truncate text-right text-xs font-bold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        여행 정보 수정
      </button>
    </section>
  );
}

function ActionButton({ onClick, primary = false, testId, children }: { onClick: () => void; primary?: boolean; testId?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
        primary
          ? 'bg-myrealtrip-blue text-white hover:bg-blue-700'
          : 'border border-slate-200 bg-white text-slate-800 hover:border-myrealtrip-blue hover:text-myrealtrip-blue'
      }`}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="닫기"
            title="닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function UnsavedChangesModal({
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onCancel,
}: {
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="저장되지 않은 변경사항" onClose={onCancel}>
      <p className="text-sm text-slate-700">최신 정보가 반영되지 않았습니다. 저장하시겠습니까?</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onSaveAndLeave}
          className="rounded-lg bg-myrealtrip-blue px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          저장하고 나가기
        </button>
        <button
          type="button"
          onClick={onLeaveWithoutSaving}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          저장하지 않고 나가기
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          취소
        </button>
      </div>
    </Modal>
  );
}
