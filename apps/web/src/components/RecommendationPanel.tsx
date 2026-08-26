import { Plus } from 'lucide-react';
import type { TravelBlock, TravelDay } from '../types/travel';
import { TravelBlockCard } from './TravelBlockCard';

interface RecommendationPanelProps {
  recommendations: TravelBlock[];
  selectedDay?: TravelDay;
  onAddBlock: (block: TravelBlock) => void;
}

export function RecommendationPanel({ recommendations, selectedDay, onAddBlock }: RecommendationPanelProps) {
  const recommendationScope = selectedDay?.region ?? selectedDay?.city;

  return (
    <aside className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">추천 블록</h2>
        <p className="mt-1 text-sm text-slate-600">
          {recommendationScope ? `${recommendationScope} 기준 추천입니다. ` : ''}클릭하면 {selectedDay ? selectedDay.title : 'Day 1'}에 추가됩니다.
        </p>
      </div>
      <div className="space-y-3">
        {recommendations.map((block) => (
          <button
            key={block.id}
            type="button"
            data-testid="recommendation-card"
            onClick={() => onAddBlock(block)}
            className="group w-full text-left"
          >
            <div className="relative">
              <TravelBlockCard block={block} dayId="recommendations" draggable={false} />
              <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-myrealtrip-blue shadow-sm transition group-hover:bg-myrealtrip-blue group-hover:text-white">
                <Plus size={18} aria-hidden="true" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
