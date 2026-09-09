import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const supportedKeys = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items', 'prefixItems',
  'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties', 'additionalProperties', 'required',
]);

function geminiSubset(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSubset);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (!supportedKeys.has(key)) return [];
    if (key === 'properties' || key === '$defs') {
      if (!child || typeof child !== 'object' || Array.isArray(child)) return [];
      return [[key, Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, geminiSubset(schema)]))]];
    }
    return [[key, geminiSubset(child)]];
  }));
}

export function toGeminiResponseJsonSchema(schema: ZodTypeAny, compatibility?: 'travel-plan'): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' });
  const result = geminiSubset(jsonSchema) as Record<string, unknown>;
  if (compatibility === 'travel-plan') {
    // Gemini rejects the complex blocks array with maxItems=100. Local Zod and
    // itinerary validation still enforce their original limits after generation.
    let node: unknown = result;
    for (const key of ['properties', 'days', 'items', 'properties', 'blocks']) {
      node = node && typeof node === 'object' && !Array.isArray(node)
        ? (node as Record<string, unknown>)[key] : undefined;
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) delete (node as Record<string, unknown>).maxItems;
  }
  return result;
}
