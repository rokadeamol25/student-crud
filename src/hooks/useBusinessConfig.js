import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBusinessConfig } from '../config/businessTypes';

/**
 * Returns feature config for the current tenant.
 * Merges: DEFAULTS → business_type preset → tenant.feature_config overrides.
 */
export function useBusinessConfig() {
  const { tenant } = useAuth();
  const businessType = tenant?.business_type ?? null;
  const featureConfig = tenant?.feature_config ?? null;
  return useMemo(
    () => getBusinessConfig(businessType, featureConfig),
    [businessType, featureConfig]
  );
}
