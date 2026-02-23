# CALC

I kept losing track of old calculations — what fed into what, which numbers I'd already worked out, etc. So I built (with codex + claude) a calculator where every result is automatically saved and can be organized into folders and sub-folders to find later for recalculations.


## Features

- basic keypad + swipe-up scientific keypad
- history saved on every `=`
- hierarchical folders and sub-folders for organizing saved calculations

## Local prerequisites

- Node.js `>= 20.10.0`
- Yarn
- Android SDK with:
  - `platform-tools`
  - `platforms;android-36`
  - `build-tools;36.0.0`
- `adb`

## Build release APK

1. Ensure `android/local.properties` points to your SDK:

```properties
sdk.dir=/Users/<username>/Library/Android/sdk
```

2. use JDK 21 for Gradle:

```sh
cd ./android
JAVA_HOME=/tmp/jdk21/Contents/Home PATH="/tmp/jdk21/Contents/Home/bin:$PATH" ./gradlew assembleRelease
```

3. APK output:

```text
./android/app/build/outputs/apk/release/app-release.apk
```

## Generate iOS build

1. Install iOS native dependencies:

```sh
cd ./ios
bundle install
bundle exec pod install
```

2. Build and install on a booted iOS simulator:

```sh
cd ./justcalc
yarn ios
```

3. Build from Xcode for a physical iPhone (recommended):

```sh
open ./ios/CALC.xcworkspace
```

In Xcode, select your team/signing profile, choose your connected device, then press Run to build and install.

## Install on Pixel

```sh
adb devices
adb install -r ./android/app/build/outputs/apk/release/app-release.apk
```

## Build and test checks

```sh
yarn lint
yarn test --watch=false
yarn tsc --noEmit
```
