import { AiProviderError } from '@travel-blocks/ai';
import { TripPlanningInputSchema, type PlaceRankingCandidate, type TravelIntent, type TravelPlanDraft, type VerifiedPlace } from '@travel-blocks/shared';
import type { PlaceSearchProvider } from './places.js';
const labels={sightseeing:'popular attractions',food:'local restaurants',cafe:'cafes',activity:'activities',stay:'hotels',transport:'transport hubs'} as const;
export async function retrieveIntentCandidates(places:PlaceSearchProvider,intent:TravelIntent):Promise<PlaceRankingCandidate[]>{
 const city=intent.destination?.city;const region=intent.destination?.region;if(!city&&!region)return [];
 const categories=intent.requestedCategories.length?intent.requestedCategories:['sightseeing','food','cafe','activity'] as const;
 const results=await Promise.all(categories.map(category=>places.search({query:labels[category],category,city,region})));
 const seen=new Set<string>();const candidates:PlaceRankingCandidate[]=[];
 for(const place of results.flat()){const candidateId=`${place.provider}:${place.providerPlaceId}`;if(seen.has(candidateId))continue;seen.add(candidateId);candidates.push({...place,candidateId});if(candidates.length===40)break}return candidates;
}
export function buildTripPlanningInput(prompt:string,intent:TravelIntent,candidates:PlaceRankingCandidate[]){return TripPlanningInputSchema.parse({prompt,intent,candidates})}
export function groundPlanWithCandidates(plan:TravelPlanDraft,candidates:PlaceRankingCandidate[]):TravelPlanDraft{
 const byId=new Map<string,VerifiedPlace>(candidates.map(({candidateId:_id,...place})=>[`${place.provider}:${place.providerPlaceId}`,place]));
 return {...plan,days:plan.days.map(day=>({...day,blocks:day.blocks.map(block=>{if(!block.place)return block;const verified=byId.get(`${block.place.provider}:${block.place.providerPlaceId}`);if(!verified)throw new AiProviderError('invalid_output',false);return {...block,title:verified.name,category:verified.category,location:verified.formattedAddress,place:{provider:verified.provider,providerPlaceId:verified.providerPlaceId,verified:true as const}}})}))};
}
