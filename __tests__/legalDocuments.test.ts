import { allLegalDocumentsAccepted, legalDocuments, legalLanguage } from '../src/utils/legalDocuments';

describe('registration: the three legal documents', () => {
  it('links the landing-page footer documents, in English outside the EU', () => {
    expect(legalDocuments('US')).toEqual([
      { key: 'privacy', title: 'Privacy Policy', url: 'https://app.myautodata.com/en/policy' },
      { key: 'terms', title: 'Terms & Conditions', url: 'https://app.myautodata.com/en/terms-and-conditions' },
      { key: 'monetization', title: 'Monetization Terms', url: 'https://app.myautodata.com/en/monetization-terms' },
    ]);
  });

  it('uses the German pages for EU countries (like the registration page), English before a country is chosen', () => {
    expect(legalDocuments('DE').map(d => d.url)).toEqual([
      'https://app.myautodata.com/de/policy',
      'https://app.myautodata.com/de/terms-and-conditions',
      'https://app.myautodata.com/de/monetization-terms',
    ]);
    expect(legalLanguage(null)).toBe('en');
    expect(legalLanguage('GB')).toBe('en');
    expect(legalLanguage('AT')).toBe('de');
  });

  it('allows registration only when all three are ticked', () => {
    expect(allLegalDocumentsAccepted({})).toBe(false);
    expect(allLegalDocumentsAccepted({ privacy: true, terms: true })).toBe(false);
    expect(allLegalDocumentsAccepted({ privacy: true, terms: true, monetization: false })).toBe(false);
    expect(allLegalDocumentsAccepted({ privacy: true, terms: true, monetization: true })).toBe(true);
  });
});
