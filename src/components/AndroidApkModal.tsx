import { useState } from 'react';
import type { LanNetworkInfo } from '../game/types';

interface AndroidApkModalProps {
  lanInfo: LanNetworkInfo | null;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstallPWA: () => Promise<boolean>;
  onClose: () => void;
}

const APK_BUILD_COMMANDS = `npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug`;

export function AndroidApkModal({
  lanInfo,
  isInstallable,
  isInstalled,
  isIOS,
  onInstallPWA,
  onClose,
}: AndroidApkModalProps) {
  const [copiedCmd, setCopiedCmd] = useState(false);

  const primaryLanUrl =
    lanInfo && lanInfo.addresses.length > 0
      ? `http://${lanInfo.addresses[0]}:${lanInfo.port}`
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(APK_BUILD_COMMANDS);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      setCopiedCmd(false);
    }
  };

  const handleDownloadCapacitorConfig = () => {
    const content = `import type { CapacitorConfig } from '@capacitor/cli';

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
`;
    const blob = new Blob([content], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'capacitor.config.ts';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-apk-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 shadow-2xl p-5 sm:p-6"
        style={{ backgroundColor: '#0E1729' }}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 id="android-apk-title" className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Android APK &amp; Mobile Install
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Offline 1-player AI &amp; local Wi-Fi multiplayer packaged for Android
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Android APK guide"
            className="w-11 h-11 rounded-lg border border-white/12 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Option 1: Instant Android Fullscreen App Install (PWA) */}
          <div className="p-4 rounded-xl bg-[#09101E] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">1. Instant Android Fullscreen Install</h3>
              <span className="text-xs text-emerald-300 font-medium">
                {isInstalled ? 'Installed' : 'Works Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open <span className="font-mono-code text-slate-200">{primaryLanUrl}</span> on Android Chrome and install directly to your home screen for fullscreen portrait &amp; landscape play with offline 1-player AI.
            </p>
            {isInstallable && !isInstalled && (
              <button
                type="button"
                onClick={() => {
                  onInstallPWA().catch(() => undefined);
                }}
                className="w-full h-11 rounded-lg bg-[#D93829] hover:bg-[#E04536] text-white text-sm font-semibold cursor-pointer"
              >
                Install SpinCourt App Now
              </button>
            )}
            {isIOS && !isInstalled && (
              <p className="text-xs text-amber-200">
                On iOS Safari: tap Share → Add to Home Screen.
              </p>
            )}
          </div>

          {/* Option 2: Build Native Android .apk with Capacitor */}
          <div className="p-4 rounded-xl bg-[#09101E] border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">2. Compile Native Android .APK (Capacitor)</h3>
              <button
                type="button"
                onClick={handleDownloadCapacitorConfig}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium underline underline-offset-2 cursor-pointer"
              >
                Download config
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This project already includes <span className="font-mono-code text-slate-200">capacitor.config.ts</span> with cleartext local Wi-Fi permissions enabled. Run these commands in the project folder with Android SDK installed to generate <span className="font-mono-code text-slate-200">app-debug.apk</span>:
            </p>
            <div className="relative">
              <pre className="p-3 rounded-lg bg-slate-950 border border-white/10 text-[11px] font-mono-code text-slate-200 overflow-x-auto leading-relaxed">
                {APK_BUILD_COMMANDS}
              </pre>
              <button
                type="button"
                onClick={handleCopyCommands}
                className="mt-2 w-full h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/12 text-xs font-semibold text-white cursor-pointer"
              >
                {copiedCmd ? 'Build Commands Copied' : 'Copy APK Build Commands'}
              </button>
            </div>
          </div>

          {/* Option 3: Local Wi-Fi Setup */}
          <div className="text-xs text-slate-400 leading-relaxed px-1">
            <strong className="text-slate-200">Local Wi-Fi Tip:</strong> When running the compiled APK on two Android phones, open <strong className="text-slate-200">Wi-Fi Multiplayer → Custom LAN Server</strong> and point both phones to <span className="font-mono-code text-slate-200">{primaryLanUrl}</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
