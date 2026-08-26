import type { PlaceSearchInput, VerifiedPlace } from '@travel-blocks/shared';
export interface PlaceSearchProvider { search(input:PlaceSearchInput):Promise<VerifiedPlace[]>; getPlace(placeId:string):Promise<VerifiedPlace|null> }
export class UnconfiguredPlaceProvider implements PlaceSearchProvider { async search():Promise<VerifiedPlace[]>{throw Object.assign(new Error('PLACE_PROVIDER_UNAVAILABLE'),{code:'PLACE_PROVIDER_UNAVAILABLE',retryable:true});} async getPlace():Promise<VerifiedPlace|null>{throw Object.assign(new Error('PLACE_PROVIDER_UNAVAILABLE'),{code:'PLACE_PROVIDER_UNAVAILABLE',retryable:true});} }
export interface ExtractedSource { title:string; content:string; canonicalUrl:string }
export interface SourceExtractor { supports(url:URL):boolean; extract(url:URL):Promise<ExtractedSource> }
