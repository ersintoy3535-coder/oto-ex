export type ThemeName = 'navy' | 'dark';

export type ThemeColors = {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  brand: string;
  brandPrimary: string;
  onBrandPrimary: string;
  brandSecondary: string;
  brandTertiary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
  divider: string;
};

export const NAVY: ThemeColors = {
  surface: '#0A1628',
  onSurface: '#F5F7FA',
  surfaceSecondary: '#142139',
  onSurfaceSecondary: '#C7D2E0',
  surfaceTertiary: '#1E2D4A',
  onSurfaceTertiary: '#8FA0B8',
  brand: '#FFC93C',
  brandPrimary: '#FFC93C',
  onBrandPrimary: '#0A1628',
  brandSecondary: '#FFE066',
  brandTertiary: '#3D2E00',
  success: '#4ADE80',
  warning: '#FFC93C',
  error: '#F87171',
  info: '#8FA0B8',
  border: '#1E2D4A',
  borderStrong: '#2E4270',
  divider: '#142139',
};

export const DARK: ThemeColors = {
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

export const THEMES: Record<ThemeName, ThemeColors> = { navy: NAVY, dark: DARK };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const fonts = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
};

export const trafficColor = (colors: ThemeColors, level: string) => {
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
