import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'sa.thiqah.maintenance',
  appName: 'ثقة',
  webDir: 'dist',
  server: { androidScheme: 'https', iosScheme: 'https' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0B2440' },
    Keyboard: { resize: 'body' }
  }
};
export default config;
