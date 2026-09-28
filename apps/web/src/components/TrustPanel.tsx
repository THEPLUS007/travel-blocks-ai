import type { TravelDay } from '../types/travel';

interface TrustPanelProps {
  days: TravelDay[];
}

export function TrustPanel({ days }: TrustPanelProps) {
  const blocks = days.flatMap((day) => day.blocks);
  const verifiedPlaceCount = blocks.filter((block) => block.place?.verified === true).length;
  const unverifiedPlaceCount = blocks.length - verifiedPlaceCount;

  return (
    <section
      className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-slate-900"
      aria-labelledby="trust-panel-title"
      data-testid="trust-panel"
    >
      <p className="text-xs font-bold uppercase text-myrealtrip-blue">Itinerary trust</p>
      <h2 id="trust-panel-title" className="mt-1 text-base font-bold text-slate-950">
        일정 확인 범위
      </h2>
      <p className="mt-3 text-sm font-semibold text-slate-800">
        {verifiedPlaceCount} / {blocks.length} 블록이 장소 제공자 정보와 연결되어 있습니다.
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        장소 확인은 장소 이름과 주소의 제공자 연결 여부만 의미합니다. 시간, 예상 비용, 메모는 사용자 또는 AI가 작성한 계획 정보이며 장소 확인 범위에 포함되지 않습니다.
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md border border-blue-100 bg-white/80 px-3 py-2">
          <dt className="font-semibold text-slate-500">장소 제공자 연결</dt>
          <dd className="mt-0.5 font-bold text-slate-800">{verifiedPlaceCount}개 블록</dd>
        </div>
        <div className="rounded-md border border-blue-100 bg-white/80 px-3 py-2">
          <dt className="font-semibold text-slate-500">장소 미확인</dt>
          <dd className="mt-0.5 font-bold text-slate-800">{unverifiedPlaceCount}개 블록</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-6 text-slate-700">영업시간은 현재 일정 생성 경로에서 확인되지 않았습니다.</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">실제 경로와 이동시간은 현재 제공되지 않습니다.</p>
    </section>
  );
}
