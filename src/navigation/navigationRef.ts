import { createNavigationContainerRef } from '@react-navigation/native';

// Module-level ref so any hook or service can navigate imperatively
// without needing to be inside the React navigation tree.
export const navigationRef = createNavigationContainerRef<any>();
