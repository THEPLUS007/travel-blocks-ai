import { WandSparkles } from 'lucide-react';

interface AnalysisPanelProps {
  sourceContent: string;
  isAnalyzing: boolean;
  onSourceContentChange: (content: string) => void;
  onAnalyze: () => void;
}

export function AnalysisPanel({
  sourceContent,
  isAnalyzing,
  onSourceContentChange,
  onAnalyze,
}: AnalysisPanelProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">AI 텍스트 분석</h2>
        <p className="mt-1 text-sm text-slate-600">입력 내용을 AI가 자동 판별해 Day별 블록 일정으로 변환합니다.</p>
      </div>
      <textarea
        className="min-h-44 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
        value={sourceContent}
        onChange={(event) => onSourceContentChange(event.target.value)}
        placeholder="여행 메모 또는 붙여넣은 여행 콘텐츠 본문을 입력해 주세요."
      />
      <button
        type="button"
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-myrealtrip-mint px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <WandSparkles size={18} aria-hidden="true" />
        {isAnalyzing ? '분석 중' : 'AI 분석 실행'}
      </button>
    </section>
  );
}
