# Building SpinCourt Ping Pong as an Android Release APK

SpinCourt Ping Pong supports both **automated cloud APK builds (GitHub Actions)** and **local Gradle release builds** using **Capacitor** (offline single-player bundled inside the APK + local Wi-Fi multiplayer over WebSockets).

## Option 1: Automated Release APK via GitHub Actions (No Local Android Studio Needed)

1. Push this git repository to GitHub (`git remote add origin <your-repo-url> && git push -u origin main`).
2. GitHub Actions automatically triggers `.github/workflows/build-release-apk.yml`.
3. Open your repository's **Actions → Build Android Release APK** run and download the **`SpinCourt-PingPong-release-apk`** artifact containing `SpinCourt-PingPong-release.apk`.
4. *(Optional for Google Play Store releases)* Add these repository secrets in GitHub Settings → Secrets and variables → Actions:
   - `ANDROID_KEYSTORE_BASE64` (base64-encoded `.keystore` file)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

## Option 2: Build Signed Release APK Locally

### Prerequisites
- Node.js 20+
- JDK 17+
- Android SDK (`ANDROID_HOME` configured)

### One-Command Release Build
```bash
bash scripts/build-release-apk.sh
```
This builds the production web bundle, adds/syncs Capacitor Android with cleartext Wi-Fi permissions enabled, runs `./gradlew assembleRelease`, aligns (`zipalign`), and signs `SpinCourt-PingPong-release.apk`.

## Playing Over Local Wi-Fi with the APK
1. Start the SpinCourt server on one device/PC on your Wi-Fi network (`npm run dev` or `npm start`).
2. Note the local Wi-Fi address shown in the **Wi-Fi Multiplayer** lobby (for example `192.168.1.25:3000`).
3. On Android phones running the APK, open **Wi-Fi Multiplayer → Custom LAN Server**, enter that Wi-Fi server address, and tap **Host Wi-Fi Room** or **Join** with the 4-character room code.
4. For **1-Player Solo Mode**, no server or Wi-Fi connection is required—the AI runs completely offline inside the APK.
