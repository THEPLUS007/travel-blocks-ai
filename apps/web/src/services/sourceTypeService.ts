import type { TravelSourceType } from '../types/travel';

export function inferTravelSourceType(content: string): TravelSourceType {
  const normalizedContent = content.trim().toLowerCase();

  if (/https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(normalizedContent)) {
    return 'youtube';
  }

  if (/https?:\/\//.test(normalizedContent)) {
    return 'blog';
  }

  return 'text';
}
