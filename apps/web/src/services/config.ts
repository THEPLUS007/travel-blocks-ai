export const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true';
export const API_TIMEOUT_MS = 120000;
export const PLACE_SEARCH_DEBOUNCE_MS = 350;

// Production uses '/' for same-origin Nginx serving, including SPA routes.
// Development retains Vite's relative base for code-server previews.
const API_V1_BASE = `${import.meta.env.BASE_URL}api/v1`;

export const INTERNAL_ANALYSIS_ENDPOINT = `${API_V1_BASE}/ai/analyze-text`;
export const INTERNAL_SOURCE_ANALYSIS_ENDPOINT = `${API_V1_BASE}/ai/analyze-source`;
export const INTERNAL_GENERATE_TRIP_ENDPOINT = `${API_V1_BASE}/ai/generate-trip`;
export const INTERNAL_RECOMMENDATIONS_ENDPOINT = `${API_V1_BASE}/ai/recommendations`;
export const INTERNAL_PLACE_SEARCH_ENDPOINT = `${API_V1_BASE}/places/search`;
export const INTERNAL_TRIPS_ENDPOINT = `${API_V1_BASE}/trips`;
