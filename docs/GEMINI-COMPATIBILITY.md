# Gemini travel-plan schema compatibility

Gemini can reject the complex travel-plan blocks array with `maxItems: 100`.
The explicit `travel-plan` compatibility option removes only
`properties.days.items.properties.blocks.maxItems` from the outgoing JSON schema.
The generic conversion remains unchanged. The adapter applies the option only
when using `GenerateTripResponseSchema`, including planTrip/generateTrip and
analyzeText (also used by the analyze-source route).

Shared Zod validation still enforces 100 blocks and the domain validator still
rejects more than 12 blocks per day. Grounding, candidate integrity checks and
API itinerary validation remain unchanged. Intent/ranking limits are preserved.

Follow-up: preserve bounded, sanitized provider error diagnostics on non-2xx
responses. Error parsing and raw payload logging are not changed by this hotfix.

## Zod 4 compatibility candidate

In `compat/security-dependency-upgrades`, conversion uses native `z.toJSONSchema` in draft-7/input mode with inline reuse. The adapter preserves closed provider-side object schemas and the existing default/array-limit behavior. Golden fixtures from Zod 3 compare the three task response schemas, allowing only the native safe-integer maximum for dayNumber. Application Zod and itinerary checks remain independent. See [DEPENDENCY_COMPATIBILITY.md](DEPENDENCY_COMPATIBILITY.md) for test results and deployment limitations.
