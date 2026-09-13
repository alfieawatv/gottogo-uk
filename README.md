# Got to Go — UK Toilet Finder

A ready-to-deploy web app to find public toilets across the UK.

**Data:** Official [Toilet Map](https://www.toiletmap.org.uk/dataset) open dataset (~16,000 facilities)  
**Licence:** Contains data from the Toilet Map © Public Convenience Ltd — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Features

- Full UK toilet dataset (offline after first load)
- GPS locate + distance sorting
- Search by town or postcode
- Filters: accessible, free, baby change, RADAR, all-gender
- Adjustable radius (2–20 km)
- Directions & share
- Installable PWA (Add to Home Screen)
- Dark map UI, mobile + desktop

## Deploy

### Vercel
1. Import this repo on [vercel.com](https://vercel.com)
2. Deploy (no build settings needed)

### GitHub Pages
1. Settings → Pages → Deploy from branch `main` / root
2. Open `https://alfieawatv.github.io/gottogo-uk/`

### Local
```bash
npx serve .
```

Keep `index.html` and `toilets.json` in the same folder.
