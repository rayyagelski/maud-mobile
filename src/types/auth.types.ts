export interface JwtClaims {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  premium: boolean;
  hasImperialUnits: boolean;
  refreshToken: string;
  refreshExp: number;
  vehicleId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface AuthState {
  token: string | null;
  claims: JwtClaims | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
