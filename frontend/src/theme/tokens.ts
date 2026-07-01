export const colors = {
  surface: '#0D0E11',
  onSurface: '#F3F4F6',
  surfaceSecondary: '#16181D',
  onSurfaceSecondary: '#D1D5DB',
  surfaceTertiary: '#1F2229',
  onSurfaceTertiary: '#9CA3AF',
  brand: '#E63946',
  brandPrimary: '#E63946',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#F4A261',
  brandTertiary: '#311417',
  success: '#2A9D8F',
  warning: '#F4A261',
  error: '#E63946',
  info: '#8D99AE',
  border: '#2D313A',
  borderStrong: '#4B5563',
  divider: '#1F2229',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const trafficColor = (level: string) => {
  if (level === 'green') return colors.success;
  if (level === 'yellow') return colors.warning;
  if (level === 'red') return colors.error;
  return colors.info;
};

export const trafficLabel = (level: string) => {
  if (level === 'green') return 'İYİ';
  if (level === 'yellow') return 'DİKKAT';
  if (level === 'red') return 'KRİTİK';
  return '—';
};
