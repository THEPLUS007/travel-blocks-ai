import { ArrowLeft, Blocks, Bot, Film, Luggage, WandSparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EMPTY_TRIP_FORM } from '../constants/travel';
import type { TripFormData } from '../types/travel';

type OnboardingMode = 'manual' | 'ai' | 'source';

interface OnboardingProps {
  isAnalyzing: boolean;
  errorMessage: string;
  backLabel?: string;
  onBack?: () => void;
  onCreateManualTrip: (trip: TripFormData) => void;
  onCreateAiTrip: (content: string) => Promise<void>;
  onCreateSourceTrip: (content: string) => Promise<void>;
}

const modes: Array<{
  id: OnboardingMode;
  title: string;
  description: string;
  Icon: typeof Luggage;
}> = [
  {
    id: 'manual',
    title: '새 여행 직접 생성',
    description: '빈 Day 보드에서 여행 블록을 직접 조립합니다.',
    Icon: Luggage,
  },
  {
    id: 'ai',
    title: 'AI 여행 생성',
    description: '자유로운 요청을 AI가 Day별 블록으로 바꿉니다.',
    Icon: Bot,
  },
  {
    id: 'source',
    title: 'AI 입력 분석',
    description: '여행 메모나 콘텐츠 본문을 그대로 입력하면 AI가 자동 분석합니다.',
    Icon: Film,
  },
];

export function Onboarding({
  isAnalyzing,
  errorMessage,
  backLabel,
  onBack,
  onCreateManualTrip,
  onCreateAiTrip,
  onCreateSourceTrip,
}: OnboardingProps) {
  const [mode, setMode] = useState<OnboardingMode>('manual');
  const [formData, setFormData] = useState<TripFormData>(EMPTY_TRIP_FORM);
  const [aiPrompt, setAiPrompt] = useState('');
  const [sourceContent, setSourceContent] = useState('');

  const updateField = (field: keyof TripFormData, value: string) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateManualTrip(formData);
  };

  const handleAiSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateAiTrip(aiPrompt);
  };

  const handleSourceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateSourceTrip(sourceContent);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950" data-testid="new-user-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-myrealtrip-blue text-white">
              <Blocks size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-myrealtrip-ink">Travel Blocks AI</h1>
              <p className="text-sm text-slate-600">여행을 블록으로 조립하는 AI 여행 일정 편집 서비스</p>
            </div>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {backLabel ?? '내 여행 목록으로 돌아가기'}
            </button>
          ) : null}
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            {modes.map(({ id, title, description, Icon }) => {
              const isSelected = mode === id;

              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`onboarding-mode-${id}`}
                  onClick={() => setMode(id)}
                  className={`flex w-full items-start gap-3 rounded-lg border bg-white p-4 text-left transition ${
                    isSelected ? 'border-myrealtrip-blue ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-myrealtrip-blue text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-950">{title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            {mode === 'manual' ? (
              <form className="space-y-4" onSubmit={handleManualSubmit}>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">새 여행 직접 생성</h2>
                  <p className="mt-1 text-sm text-slate-600">기본 정보를 입력하면 빈 Day 1 보드가 생성됩니다.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="여행 제목" value={formData.name} onChange={(value) => updateField('name', value)} placeholder="예: 제주 감성 3일 여행" />
                  <TextField label="국가" value={formData.country} onChange={(value) => updateField('country', value)} placeholder="예: 대한민국" />
                  <TextField label="도시" value={formData.city} onChange={(value) => updateField('city', value)} placeholder="예: 제주" />
                  <TextField label="여행 기간" value={formData.duration} onChange={(value) => updateField('duration', value)} placeholder="예: 2박 3일" />
                  <TextField label="예산" value={formData.budget} onChange={(value) => updateField('budget', value)} placeholder="예: 80만원" />
                  <TextField label="인원" value={formData.travelers} onChange={(value) => updateField('travelers', value)} placeholder="예: 2명" />
                </div>
                <TextField label="여행 스타일" value={formData.style} onChange={(value) => updateField('style', value)} placeholder="예: 카페, 바다, 렌터카" />
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">설명</span>
                  <textarea
                    className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
                    value={formData.description}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder="여행에서 꼭 챙기고 싶은 조건을 적어주세요."
                  />
                </label>
                <SubmitButton disabled={isAnalyzing} label="여행 생성" testId="manual-trip-button" />
              </form>
            ) : null}

            {mode === 'ai' ? (
              <form className="space-y-4" onSubmit={handleAiSubmit}>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">AI 여행 생성</h2>
                  <p className="mt-1 text-sm text-slate-600">여러 질문 없이 큰 입력창 하나로 AI 일정을 생성합니다.</p>
                </div>
                <textarea
                  className="min-h-64 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder={'3박4일 제주\n커플 여행\n렌터카 이용\n예산 80만원\n카페 많이 가고 싶어요\n바다도 보고 싶어요'}
                />
                <SubmitButton disabled={isAnalyzing} label={isAnalyzing ? 'AI 일정 생성 중' : 'AI 일정 생성'} testId="generate-trip-button" />
              </form>
            ) : null}

            {mode === 'source' ? (
              <form className="space-y-4" onSubmit={handleSourceSubmit}>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">AI 입력 분석</h2>
                  <p className="mt-1 text-sm text-slate-600">입력한 여행 텍스트를 AI가 블록으로 변환합니다.</p>
                </div>
                <textarea
                  className="min-h-64 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
                  value={sourceContent}
                  onChange={(event) => setSourceContent(event.target.value)}
                  placeholder="여행 메모 또는 붙여넣은 여행 콘텐츠 본문을 입력해보세요."
                />
                <SubmitButton disabled={isAnalyzing} label={isAnalyzing ? '분석 중' : '분석 시작'} testId="analyze-source-button" />
              </form>
            ) : null}

            {isAnalyzing ? (
              <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-950">
                  <WandSparkles size={18} aria-hidden="true" />
                  AI 분석 진행
                </div>
                <div className="mt-3 grid gap-2 text-sm text-blue-950 sm:grid-cols-3">
                  {['입력 확인', '장소 추출', '여행 블록 생성'].map((step) => (
                    <span key={step} className="rounded-md bg-white px-3 py-2 font-medium shadow-sm">
                      {step}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
                {errorMessage}
              </p>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function TextField({ label, value, placeholder, onChange }: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SubmitButton({ disabled, label, testId }: { disabled: boolean; label: string; testId?: string }) {
  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-myrealtrip-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      <WandSparkles size={18} aria-hidden="true" />
      {label}
    </button>
  );
}
