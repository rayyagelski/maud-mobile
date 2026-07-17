// Template for src/config/env.ts (gitignored, not committed — GitHub's push
// protection blocks real API keys in source). Copy this file to env.ts and
// fill in real values to run the app locally.
//
// HERE routing/geocoding/weather keys are typically restricted by bundle ID
// / referrer rather than treated as a fully secret server-side key, so
// plaintext-in-bundle is an acceptable choice (unlike the backend's
// ANTHROPIC_API_KEY, which must never ship client-side) — but committing the
// real value to git still gets flagged by secret scanning and isn't good
// practice regardless. If key rotation without a rebuild becomes important,
// migrate to `react-native-config` instead.
export const HERE_API_KEY = 'REPLACE_ME_HERE_API_KEY';

// Get a free-tier key at https://openweathermap.org/api.
export const OPENWEATHER_API_KEY = 'REPLACE_ME_OPENWEATHER_API_KEY';
