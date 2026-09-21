# Google Places response compatibility

Text Search and Place Details share a parser. Place identity, display name,
formatted address and numeric coordinates remain required. Auxiliary address
components may be absent or empty; omitted component `types` and `longText`
normalize to an empty array and string. Unknown fields are stripped and unknown
component types are ignored for locality mapping.

Components without usable text are skipped when mapping locality. No city is
inferred from a province or district: improving country-specific locality mapping
is separate work. Search context continues to take precedence over components.

Recommendation category searches retain `Promise.all`: a provider failure is
propagated instead of silently dropping failed categories. This compatibility fix
addresses parsing at the source without changing provider failure policy.

## Opening-hours capability

Opening hours are a separate lazy capability (`PlaceOpeningHoursProvider.getOpeningHours`) for a selected or explicitly requested place. Google details requests use only `id,businessStatus,timeZone,currentOpeningHours,regularOpeningHours`; the Text Search field mask is unchanged. The parser stores normalized provider-neutral facts and provenance, never raw Google responses or credentials. A valid place response without hours is successful with unknown opening-hours data, while transport/provider failures remain `PlaceProviderError` failures. Evaluation uses current-hours coverage first and treats regular-hours-only data as lower-confidence caution. No AI fallback or live call is used by deterministic tests.
