#!/usr/bin/env bash
set -euo pipefail

# Builds and signs a release Android APK for SpinCourt Ping Pong.
# Requires: Node.js 20+, JDK 17+, and Android SDK (ANDROID_HOME set).

if ! command -v java >/dev/null 2>&1; then
  echo "Error: JDK 17+ is required to compile an Android APK." >&2
  exit 1
fi

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK_ROOT" ] || [ ! -d "$SDK_ROOT" ]; then
  echo "Error: ANDROID_HOME (or ANDROID_SDK_ROOT) is not set to a valid Android SDK path." >&2
  exit 1
fi

echo "1/5 Installing dependencies & building production web bundle..."
npm install
npm run build

echo "2/5 Syncing Capacitor Android project..."
npm install --no-save @capacitor/core @capacitor/cli @capacitor/android
if [ ! -d "android" ]; then
  npx cap add android
fi
npx cap sync android

MANIFEST="android/app/src/main/AndroidManifest.xml"
if ! grep -q "usesCleartextTraffic" "$MANIFEST"; then
  sed -i.bak 's/<application /<application android:usesCleartextTraffic="true" /' "$MANIFEST"
  rm -f "${MANIFEST}.bak"
fi

echo "3/5 Compiling Gradle assembleRelease..."
(cd android && ./gradlew assembleRelease)

BUILD_TOOLS=$(ls -d "$SDK_ROOT/build-tools/"* | sort -V | tail -n 1)
UNSIGNED_APK="android/app/build/outputs/apk/release/app-release-unsigned.apk"
ALIGNED_APK="android/app/build/outputs/apk/release/app-release-aligned.apk"
OUTPUT_APK="SpinCourt-PingPong-release.apk"

KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-spincourt-release.keystore}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-spincourt}"
STORE_PASS="${ANDROID_KEYSTORE_PASSWORD:-spincourt-release-key}"
KEY_PASS="${ANDROID_KEY_PASSWORD:-$STORE_PASS}"

if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "4/5 Generating release signing keystore at $KEYSTORE_PATH..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname "CN=SpinCourt, OU=Mobile, O=SpinCourt, L=Unknown, S=Unknown, C=US"
fi

echo "5/5 Aligning and signing release APK..."
"$BUILD_TOOLS/zipalign" -f -v -p 4 "$UNSIGNED_APK" "$ALIGNED_APK"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE_PATH" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$STORE_PASS" \
  --key-pass "pass:$KEY_PASS" \
  --out "$OUTPUT_APK" \
  "$ALIGNED_APK"
"$BUILD_TOOLS/apksigner" verify "$OUTPUT_APK"

echo "Done! Signed release APK created at: $OUTPUT_APK"
