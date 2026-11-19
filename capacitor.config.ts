// Capacitor configuration for packaging SpinCourt Ping Pong as a native Android APK.
// See android-build/BUILD_APK.md for step-by-step APK build instructions.

export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
  };
  android?: {
    allowMixedContent?: boolean;
    backgroundColor?: string;
  };
}

const config: CapacitorConfig = {
  appId: 'com.spincourt.pingpong',
  appName: 'SpinCourt Ping Pong',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0B1220',
  },
};

export default config;
