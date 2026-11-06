# MAUD Mobility: APIs and Keys

Last reviewed: 5 November 2026

This lists every outside service used by the MAUD Mobility app and the MAUD backend. Key values are masked to their last 4 characters. The "Where the full value is" column shows where to find each one. Don't paste full keys into this file.

The backend list comes from the code and `.env.dist`. The live values on the production server weren't opened, so a listed key may be unset or unused on production.

## Mobile app

| Provider | Key | Purpose | Where the full value is | Cost / status |
|---|---|---|---|---|
| HERE Routing | `HERE_API_KEY` …RRFo | Route calculation, turn-by-turn directions, rerouting, speed limits along the route | `src/config/env.ts` (not in git) | Working. Same key for all HERE services below |
| HERE Search | same key | Address suggestions and geocoding in Route Planner | same | Working |
| HERE Discover | same key | Nearby car repair garages on the Breakdown screen | same | Working |
| HERE Weather | same key | Trip weather and severe weather alerts | same | Working |
| OpenWeather | `OPENWEATHER_API_KEY` …bb35 | Second weather source, alongside HERE (`weatherClient.ts`) | `src/config/env.ts` (not in git) | Confirm which source is primary |
| Google Maps (Android) | `GOOGLE_MAPS_API_KEY` …ueDo | Map display on Android | `android/local.properties` (not in git) | Restrict to the Android app before release |
| Google Maps (iOS) | `googleMapsApiKey` …t17s | Map display on iOS | `ios/MAUDConnect/Secrets.swift` (not in git; template in `Secrets.example.swift`) | **Replace:** this key is still in git history |
| Transistorsoft | `BACKGROUND_GEOLOCATION_LICENSE` …ZAg (Android), `TSLocationManagerLicense` …DAQ (iOS) | Background GPS library. Debug builds run without a licence; release builds need it. Each key works only for `com.maud.connect` | Android: `android/local.properties` (not in git). iOS: `ios/MAUDConnect/Info.plist` (in git; the plugin reads it from there) | Licensed. Covers library versions released up to 5 Dec 2027 |
| OpenStreetMap Overpass | none | Speed cameras, traffic lights and stop signs | No key | Public servers overloaded; lookups fail. Own hosted copy planned |
| MAUD backend | user login token | Accounts, vehicles, rewards, drivers | Issued at login, kept in encrypted phone storage | Our service (`app.myautodata.com`) |
| MAUD VGD service | user login token | Upload and read of trips and GPS points | Same | Our service (`vgd.myautodata.com/v1`) |

## Backend

On production, these are Docker Swarm secrets, read inside the container from `/run/secrets/<name>` (lowercase name).

| Provider | Key names | Purpose |
|---|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | AI driving tips, route recommendations, service intervals |
| Stripe | `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CLIENT_ID`, `STRIPE_SUBSCRIPTION_PLAN_ID` | Subscriptions, and Stripe Connect payouts for data access |
| SendGrid | `SENDGRID_API_KEY`, `MAILER_DSN`, `MAILER_URL` | Email |
| Twilio | `TWILIO_TOKEN` | SMS |
| Sentry | `BACKEND_SENTRY_DSN`, `FRONTEND_SENTRY_DSN` | Error reporting |
| MarketCheck | `MARKETCHECK_API_KEY` | VIN decoding |
| TorqueNode | `TORQUENODE_API_KEY` | Maintenance schedules |
| US EIA | `EIA_API_KEY` | US fuel prices |
| Fuel price provider | `FUEL_API_CREDENTIALS` | Fuel prices (likely GlobalPetrolPrices; confirm) |
| FuelEconomy.gov | none | Vehicle fuel consumption data |
| Google reCAPTCHA v3 | `RECAPTCHA3_KEY`, `RECAPTCHA3_SECRET` | Bot protection on web forms |
| Google Analytics / Tag Manager | `GOOGLE_ANALYTICS_ID`, `GOOGLE_ANALYTICS_MARKET_ID`, `GOOGLE_TAG_MANAGER_ID` | Website analytics |
| AWS | see note | File storage through the AWS SDK. No AWS key is listed in `.env.dist`; confirm how it's configured |

### MAUD's own secrets

These aren't outside providers, but they must stay protected: `APP_SECRET`, `JWT_SECRET_KEY`, `JWT_PUBLIC_KEY`, `JWT_PASSPHRASE`, `DATABASE_URL`, `REDIS_URL`, `MESSENGER_TRANSPORT_DSN`, `ELASTICSEARCH_URL`.

## Store and signing accounts

| Item | Current value | Status |
|---|---|---|
| Apple Team ID | `Y36G4D4J9W` | Set in the Xcode project |
| iOS bundle ID | `com.maud.connect` | Set. Old app: `com.maud.maudconnect` |
| Android application ID | `com.maud.connect` | Set. The Kotlin code package stays `com.maudconnect` |
| Android release signing key | none | **Must be created.** Release builds currently use the debug key |

## Clean-up needed

1. Restrict both Google Maps keys to our app IDs, because each key ships inside the app.
2. Restrict the HERE and OpenWeather keys where those providers allow it. The note in `env.ts` assumes this was done; it hasn't been verified.
3. Replace the iOS Google key, then delete the old one in Google Cloud. It's out of the current files, but remains in git history.
