export const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true';
export const API_TIMEOUT_MS = 120000;
export const PLACE_SEARCH_DEBOUNCE_MS = 350;

// BASE_URL is './' for the production build. Browser requests therefore stay
// under a hosting prefix such as /proxy/5173/ instead of escaping to port 8080.
const API_V1_BASE = `${import.meta.env.BASE_URL}api/v1`;

export const INTERNAL_ANALYSIS_ENDPOINT = `${API_V1_BASE}/ai/analyze-text`;
export const INTERNAL_GENERATE_TRIP_ENDPOINT = `${API_V1_BASE}/ai/generate-trip`;
export const INTERNAL_RECOMMENDATIONS_ENDPOINT = `${API_V1_BASE}/ai/recommendations`;
export const INTERNAL_PLACE_SEARCH_ENDPOINT = `${API_V1_BASE}/places/search`;
export const INTERNAL_TRIPS_ENDPOINT = `${API_V1_BASE}/trips`;
