import type { PriceLevel, TransportMode, TravelBlockCategory, TravelSourceType } from '../types/travel';

export const SOURCE_TYPE_LABELS: Record<TravelSourceType, string> = {
  youtube: 'Youtube URL',
  blog: '블로그 URL',
  text: '여행 일정 텍스트',
};

export const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const CATEGORY_LABELS: Record<TravelBlockCategory, string> = {
  stay: '숙소',
  food: '음식',
  cafe: '카페',
  sightseeing: '관광',
  activity: '액티비티',
  transport: '이동',
};

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  walk: '도보',
  bike: '자전거',
  taxi: '택시',
  bus: '버스',
  subway: '지하철',
  rental_car: '렌터카',
  flight: '비행기',
  ferry: '배',
};

export const EMPTY_TRIP_FORM = {
  name: '',
  country: '',
  city: '',
  duration: '',
  budget: '',
  travelers: '',
  style: '',
  description: '',
};
