import { Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { EMPTY_TRIP_FORM } from '../constants/travel';
import type { TripFormData } from '../types/travel';

interface TripFormProps {
  onSave: (trip: TripFormData) => void;
  initialTrip?: TripFormData;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export function TripForm({
  onSave,
  initialTrip = EMPTY_TRIP_FORM,
  title = '새 여행 생성',
  description = '기본 여행 정보를 저장한 뒤 링크나 텍스트를 분석합니다.',
  submitLabel = '저장',
}: TripFormProps) {
  const [formData, setFormData] = useState<TripFormData>(initialTrip);

  useEffect(() => {
    setFormData(initialTrip);
  }, [initialTrip]);

  const updateField = (field: keyof TripFormData, value: string) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(formData);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">여행 이름</span>
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
          value={formData.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="예: 제주 감성 3일 여행"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">국가</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.country}
            onChange={(event) => updateField('country', event.target.value)}
            placeholder="예: 대한민국"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">도시</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.city}
            onChange={(event) => updateField('city', event.target.value)}
            placeholder="예: 제주"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">기간</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.duration}
            onChange={(event) => updateField('duration', event.target.value)}
            placeholder="예: 2박 3일"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">예산</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.budget}
            onChange={(event) => updateField('budget', event.target.value)}
            placeholder="예: 80만원"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">인원</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.travelers}
            onChange={(event) => updateField('travelers', event.target.value)}
            placeholder="예: 2명"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">스타일</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
            value={formData.style}
            onChange={(event) => updateField('style', event.target.value)}
            placeholder="예: 카페, 바다"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">여행 설명</span>
        <textarea
          className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
          value={formData.description}
          onChange={(event) => updateField('description', event.target.value)}
          placeholder="예: 맛집과 카페 중심으로 여유롭게 이동하는 일정"
        />
      </label>
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-myrealtrip-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        <Save size={18} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}
