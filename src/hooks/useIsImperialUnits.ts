import { useAppSelector } from './useAppSelector';

// Backed by the JWT's `hasImperialUnits` claim (App\Service\API\Security\
// TokenManager::createEmptyTokenBuilder — derived server-side from the
// customer's country), already parsed into auth.types.ts's JwtClaims but
// never previously read anywhere in the app.
export function useIsImperialUnits(): boolean {
  return useAppSelector(s => s.auth.claims?.hasImperialUnits ?? false);
}
