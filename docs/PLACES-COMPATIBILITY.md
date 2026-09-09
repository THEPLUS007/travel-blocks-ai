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
