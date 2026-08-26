export type PriceLevel = 'low' | 'medium' | 'high';

export type TravelBlockCategory = 'stay' | 'food' | 'cafe' | 'sightseeing' | 'activity' | 'transport';

export type TravelSourceType = 'youtube' | 'blog' | 'text';

export type TransportMode = 'walk' | 'bike' | 'taxi' | 'bus' | 'subway' | 'rental_car' | 'flight' | 'ferry';


export interface TripFormData {
  name: string;
  country: string;
  city: string;
  duration: string;
  budget: string;
  travelers: string;
  style: string;
  description: string;
}

export interface TravelBlock {
  id: string;
  title: string;
  category: TravelBlockCategory;
  priceLevel: PriceLevel;
  time?: string;
  location?: string;
  memo?: string;
  estimatedCost?: string;
}

export interface TravelDay {
  id: string;
  dayNumber: number;
  title: string;
  city?: string;
  region?: string;
  blocks: TravelBlock[];
}

export interface TravelConnection {
  id: string;
  dayId: string;
  sourceBlockId: string;
  targetBlockId: string;
  transportMode?: TransportMode;
  duration?: string;
}

export interface TravelAnalysisInput {
  sourceType: TravelSourceType;
  content: string;
}

export interface DragState {
  sourceDayId: string;
  sourceBlockId: string;
}

export interface SavedTravelPlan {
  id: string;
  title: string;
  subtitle: string;
  trip: TripFormData;
  days: TravelDay[];
  connections?: TravelConnection[];
}
