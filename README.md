# Got to Go — UK Toilet Finder

Find public toilets across the UK. Live data from the [Toilet Map](https://www.toiletmap.org.uk).

## Features

- Live nearby search (Toilet Map GraphQL)
- Filters: open now, accessible, free, baby change, RADAR, all-gender, favourites
- Favourites + local ratings (on-device only)
- Walking time estimates, directions, share
- Installable PWA, offline cache of last results
- Dark / light theme, install banner
- About / privacy notes

## Data credit

Contains data from the Toilet Map © Public Convenience Ltd — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Deploy

### Vercel
Import this repo → Deploy (static, no build).

### GitHub Pages
Settings → Pages → branch `main` / root.

## Native apps (Capacitor)

```bash
npm i @capacitor/core @capacitor/cli
npx cap init "Got to Go" com.gottogo.uk --web-dir .
npx cap add ios
npx cap add android
npx cap sync
```

Then open Xcode / Android Studio to ship store builds.
