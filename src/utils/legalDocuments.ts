// The three documents a new user must accept before registering — the same
// pages as the footer of the myautodata.com landing page (Datenschutz, AGB,
// Monetisierungsrichtlinien), in English or German like the registration
// page itself (RegistrationScreen: EU countries get the German one).

// EU member-state ISO codes — anything else (including the US) gets the
// English pages. Not sourced from the backend: no EU-membership flag exists
// there today (verified — Country entity/API has no such field).
export const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
]);

export type LegalDocumentKey = 'privacy' | 'terms' | 'monetization';

export interface LegalDocument {
  key: LegalDocumentKey;
  title: string;
  url: string;
}

export function legalLanguage(countryCode: string | null | undefined): 'de' | 'en' {
  return countryCode != null && EU_COUNTRY_CODES.has(countryCode) ? 'de' : 'en';
}

export function legalDocuments(countryCode: string | null | undefined): LegalDocument[] {
  const base = `https://app.myautodata.com/${legalLanguage(countryCode)}`;
  return [
    { key: 'privacy', title: 'Privacy Policy', url: `${base}/policy` },
    { key: 'terms', title: 'Terms & Conditions', url: `${base}/terms-and-conditions` },
    { key: 'monetization', title: 'Monetization Terms', url: `${base}/monetization-terms` },
  ];
}

// Registration may continue only once every document is accepted.
export function allLegalDocumentsAccepted(accepted: Partial<Record<LegalDocumentKey, boolean>>): boolean {
  return legalDocuments(null).every(doc => accepted[doc.key] === true);
}
