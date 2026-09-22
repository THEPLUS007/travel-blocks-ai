import { z } from 'zod';
import { AnalyzeTextRequestSchema, GenerateTripRequestSchema, GenerateTripResponseSchema, PlaceRankingInputSchema, PlaceRankingResultSchema, TravelIntentSchema, TripPlanningInputSchema } from '@travel-blocks/shared';

export type AiTask = 'extract_intent' | 'generate_trip' | 'analyze_text' | 'rank_places';
export type AiCapability = 'intent_extraction' | 'trip_planning' | 'travel_content_analysis' | 'place_ranking';
export type AiTimeoutClass = 'intent' | 'short' | 'long';
export type AiFallbackPolicy = 'fail_explicitly';

export interface TaskDefinition<TTask extends AiTask, TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  readonly task: TTask;
  readonly inputSchema: TInput;
  readonly outputSchema: TOutput;
  readonly requiredCapability: AiCapability;
  readonly timeoutClass: AiTimeoutClass;
  readonly fallbackPolicy: AiFallbackPolicy;
}
type AnyTaskDefinition = TaskDefinition<AiTask, z.ZodTypeAny, z.ZodTypeAny>;
type TaskDefinitionMap = { [TTask in AiTask]: AnyTaskDefinition & { readonly task: TTask } };

export const AI_TASK_DEFINITIONS = {
  extract_intent: { task: 'extract_intent', inputSchema: GenerateTripRequestSchema, outputSchema: TravelIntentSchema, requiredCapability: 'intent_extraction', timeoutClass: 'intent', fallbackPolicy: 'fail_explicitly' },
  generate_trip: { task: 'generate_trip', inputSchema: TripPlanningInputSchema, outputSchema: GenerateTripResponseSchema, requiredCapability: 'trip_planning', timeoutClass: 'long', fallbackPolicy: 'fail_explicitly' },
  analyze_text: { task: 'analyze_text', inputSchema: AnalyzeTextRequestSchema, outputSchema: GenerateTripResponseSchema, requiredCapability: 'travel_content_analysis', timeoutClass: 'long', fallbackPolicy: 'fail_explicitly' },
  rank_places: { task: 'rank_places', inputSchema: PlaceRankingInputSchema, outputSchema: PlaceRankingResultSchema, requiredCapability: 'place_ranking', timeoutClass: 'short', fallbackPolicy: 'fail_explicitly' },
} as const satisfies TaskDefinitionMap;

export type AiTaskDefinition = typeof AI_TASK_DEFINITIONS[AiTask];
export type AiTaskInput<TTask extends AiTask> = z.infer<typeof AI_TASK_DEFINITIONS[TTask]['inputSchema']>;
export type AiTaskOutput<TTask extends AiTask> = z.infer<typeof AI_TASK_DEFINITIONS[TTask]['outputSchema']>;
