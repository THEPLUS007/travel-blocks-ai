import { z } from 'zod';

export const PriceLevelSchema = z.enum(['low', 'medium', 'high']);
export const TravelBlockCategorySchema = z.enum(['stay', 'food', 'cafe', 'sightseeing', 'activity', 'transport']);
export const TransportModeSchema = z.enum(['walk', 'bike', 'taxi', 'bus', 'subway', 'rental_car', 'flight', 'ferry']);
export const TravelSourceTypeSchema = z.enum(['youtube', 'blog', 'text']);

export const TripSchema = z.object({
  name: z.string().trim().min(1).max(120), country: z.string().trim().max(80), city: z.string().trim().max(80),
  duration: z.string().trim().max(80), budget: z.string().trim().max(80), travelers: z.string().trim().max(80),
  style: z.string().trim().max(200), description: z.string().trim().max(6000),
});

export const TravelBlockSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().trim().min(1).max(200), category: TravelBlockCategorySchema,
  priceLevel: PriceLevelSchema, time: z.string().max(40).optional(), location: z.string().max(300).optional(),
  memo: z.string().max(2000).optional(), estimatedCost: z.string().max(80).optional(),
  place: z.object({ provider: z.string(), providerPlaceId: z.string(), verified: z.literal(true) }).optional(),
});

export const TravelDaySchema = z.object({
  id: z.string().min(1).max(120), dayNumber: z.number().int().positive(), title: z.string().trim().min(1).max(120),
  city: z.string().max(80).optional(), region: z.string().max(80).optional(), blocks: z.array(TravelBlockSchema).max(100),
});

export const TravelConnectionSchema = z.object({
  id: z.string().min(1).max(120), dayId: z.string().min(1), sourceBlockId: z.string().min(1), targetBlockId: z.string().min(1),
  transportMode: TransportModeSchema.optional(), duration: z.string().max(80).optional(),
});

export const SavedTravelPlanSchema = z.object({
  id: z.string().uuid(), title: z.string(), subtitle: z.string(), trip: TripSchema, days: z.array(TravelDaySchema),
  connections: z.array(TravelConnectionSchema).default([]), version: z.number().int().positive().optional(),
  createdAt: z.string().datetime().optional(), updatedAt: z.string().datetime().optional(),
});

export const TripWriteSchema = z.object({ trip: TripSchema, days: z.array(TravelDaySchema).max(60), connections: z.array(TravelConnectionSchema).max(500) });
export const CreateTripRequestSchema = TripWriteSchema;
export const UpdateTripRequestSchema = TripWriteSchema.extend({ version: z.number().int().positive() });
export const GenerateTripRequestSchema = z.object({ prompt: z.string().trim().min(1).max(6000) });
export const AnalyzeTextRequestSchema = z.object({ content: z.string().trim().min(1).max(12000) });
export const RecommendationRequestSchema = z.object({ trip: TripSchema, day: TravelDaySchema, existingPlaces: z.array(TravelBlockSchema).max(100).default([]) });
export const GenerateTripResponseSchema = z.object({ trip: TripSchema, days: z.array(TravelDaySchema), connections: z.array(TravelConnectionSchema).default([]) });
export const RecommendationResponseSchema = z.array(TravelBlockSchema);
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), requestId: z.string() }) });

export const VerifiedPlaceSchema = z.object({
  provider: z.string(), providerPlaceId: z.string(), name: z.string(), formattedAddress: z.string(), latitude: z.number(), longitude: z.number(),
  category: TravelBlockCategorySchema, city: z.string(), region: z.string(),
});
export const PlaceSearchInputSchema = z.object({ query: z.string().trim().min(1).max(200), city: z.string().max(80).optional(), region: z.string().max(80).optional(), category: z.string().max(80).optional() });
export const PlaceRankingCandidateSchema = VerifiedPlaceSchema.extend({ candidateId: z.string().min(1).max(240) });
export const PlaceRankingInputSchema = z.object({ trip: TripSchema, day: TravelDaySchema, existingPlaces: z.array(TravelBlockSchema).max(100), candidates: z.array(PlaceRankingCandidateSchema).min(1).max(40) });
export const PlaceRankingSelectionSchema = z.object({ candidateId: z.string().min(1).max(240), reason: z.string().trim().min(1).max(500) });
export const PlaceRankingResultSchema = z.object({ selections: z.array(PlaceRankingSelectionSchema).max(5) });

export type TripFormData = z.infer<typeof TripSchema>;
export type TravelBlock = z.infer<typeof TravelBlockSchema>;
export type TravelDay = z.infer<typeof TravelDaySchema>;
export type TravelConnection = z.infer<typeof TravelConnectionSchema>;
export type SavedTravelPlan = z.infer<typeof SavedTravelPlanSchema>;
export type TravelPlanPayload = z.infer<typeof TripWriteSchema>;
export type GenerateTripInput = z.infer<typeof GenerateTripRequestSchema>;
export type AnalyzeTextInput = z.infer<typeof AnalyzeTextRequestSchema>;
export type RecommendationInput = z.infer<typeof RecommendationRequestSchema>;
export type RecommendationDraft = TravelBlock;
export type TravelPlanDraft = z.infer<typeof GenerateTripResponseSchema>;
export type VerifiedPlace = z.infer<typeof VerifiedPlaceSchema>;
export type PlaceSearchInput = z.infer<typeof PlaceSearchInputSchema>;
export type PlaceRankingCandidate = z.infer<typeof PlaceRankingCandidateSchema>;
export type PlaceRankingInput = z.infer<typeof PlaceRankingInputSchema>;
export type PlaceRankingResult = z.infer<typeof PlaceRankingResultSchema>;
export type PriceLevel = z.infer<typeof PriceLevelSchema>;
export type TravelBlockCategory = z.infer<typeof TravelBlockCategorySchema>;
export type TransportMode = z.infer<typeof TransportModeSchema>;
export type TravelSourceType = z.infer<typeof TravelSourceTypeSchema>;
export interface TravelAnalysisInput { sourceType: TravelSourceType; content: string }
export interface DragState { sourceDayId: string; sourceBlockId: string }
