import { Blocks, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TripFormData } from '../types/travel';

interface HeaderProps {
  trip: TripFormData;
  actions?: ReactNode;
}

export function Header({ trip, actions }: HeaderProps) {
  const hasTrip = Boolean(trip.name);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-myrealtrip-blue text-white">
            <Blocks size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-myrealtrip-ink">Travel Blocks AI</h1>
            <p className="text-sm text-slate-600">사용자 중심의 AI 여행 일정 편집 서비스</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <MapPin size={18} className="text-myrealtrip-blue" aria-hidden="true" />
            {hasTrip ? (
              <span>
                <strong className="text-slate-950">{trip.name}</strong> · {[trip.country, trip.city, trip.duration]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : (
              <span>새 여행을 만들면 이곳에 요약이 표시됩니다.</span>
            )}
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}
