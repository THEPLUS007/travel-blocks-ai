import { USE_MOCK } from './config';
import * as real from './realTravelApi';
import type { TravelPlanPayload } from '@travel-blocks/shared';
import type { SavedTravelPlan,TravelAnalysisInput,TravelDay,TripFormData } from '../types/travel';
const mocks=()=>import('./mockTravelApi');
export async function createTripFromForm(x:TripFormData){return USE_MOCK?(await mocks()).createTripFromForm(x):real.createTripFromForm(x)}
export async function generateTripWithAI(x:string){return USE_MOCK?(await mocks()).generateTripWithAI(x):real.generateTripWithAI(x)}
export async function analyzeLinkOrText(x:TravelAnalysisInput){return USE_MOCK?(await mocks()).analyzeLinkOrText(x):real.analyzeLinkOrText(x)}
export async function createTripFromSource(x:string){return USE_MOCK?(await mocks()).createTripFromSource(x):real.createTripFromSource(x)}
export async function getRecommendations(trip?:TripFormData,day?:TravelDay){return USE_MOCK?(await mocks()).getRecommendations(trip,day):real.getRecommendations(trip,day)}
export async function loadTrips(){return USE_MOCK?(await mocks()).loadTrips():real.loadTrips()}
export async function loadTrip(id:string){return USE_MOCK?(await mocks()).loadTrip(id):real.loadTrip(id)}
export async function createSavedTrip(payload:TravelPlanPayload):Promise<SavedTravelPlan>{if(USE_MOCK){const mock=await mocks();await mock.saveTrip(payload);return (await mock.loadTrips())[0]}return real.createSavedTrip(payload)}
export async function updateSavedTrip(id:string,version:number,payload:TravelPlanPayload):Promise<SavedTravelPlan>{if(USE_MOCK)return createSavedTrip(payload);return real.updateSavedTrip(id,version,payload)}
