import type { PriceLevel } from '../types/travel';

export function getPriceTone(priceLevel: PriceLevel): string {
  const tones: Record<PriceLevel, string> = {
    low: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    medium: 'border-amber-200 bg-amber-50 text-amber-950',
    high: 'border-rose-200 bg-rose-50 text-rose-950',
  };

  return tones[priceLevel];
}

export function getPriceBadgeTone(priceLevel: PriceLevel): string {
  const tones: Record<PriceLevel, string> = {
    low: 'bg-emerald-600 text-white',
    medium: 'bg-amber-500 text-white',
    high: 'bg-rose-600 text-white',
  };

  return tones[priceLevel];
}
