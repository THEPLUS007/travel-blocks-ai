import { analyzeLinkOrText } from './travelApi';
import type { TravelAnalysisInput, TravelDay } from '../types/travel';

export async function analyzeTravelInput(input: TravelAnalysisInput): Promise<TravelDay[]> {
  return analyzeLinkOrText(input);
}
