# ParcelLine — PID lookup demo site

Search any land parcel in **British Columbia, New Brunswick or Prince Edward Island** by PID or street address.
For each lot it shows the boundary with side lengths, the official municipality, the county or regional district, the lot size, the address, the neighbouring lots, and directions.

It is a static site with no server and no database. The visitor's browser asks each province's open-data service directly.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site |
| `config.js` | Optional Google Maps key and Map ID |
| `README.md` | This file |

## Put it online (about 2 minutes)

**Netlify (easiest):** go to https://app.netlify.com/drop and drag this whole folder onto the page. You get a link like `https://parcelline-xyz.netlify.app`.

**GitHub Pages:** create a repository, upload the three files, then open Settings → Pages → Deploy from branch → `main` / root.

**Render (static site):** New → Static Site, connect the repository, leave the build command empty, and set the publish directory to `.`.

**Your WordPress host (cPanel / FTP):** upload the folder as `/parcelline/` and open `https://yourdomain/parcelline/`.

The site also works when you just double-click `index.html`. Hosting it is better, because you can then lock the Google key to your own address.

## Turn on the Google features (optional)

1. In Google Cloud Console, create an API key and enable **Maps JavaScript API**, **Geocoding API**, **Directions API**, **Elevation API** and **Places API (New)**.
2. Under the key's restrictions, choose **Websites** and add your site address, for example `https://parcelline-xyz.netlify.app/*`.
3. Paste the key into `config.js` as `googleMapsKey`.
4. Optional: create a **vector Map ID**. In its map style, switch on the Locality, Postal code and Administrative area level 2 feature layers, then paste it as `googleMapId`. This draws Google's own town and postal-code outlines.

If you leave the key empty, everything else still works. Visitors can also add their own key from the gear icon.

Google has retired the old Directions API for new Cloud projects. If routing inside the page reports REQUEST_DENIED, the **Drive here** button still opens full Google Maps navigation.

## Data sources

| Province | Parcels | Official municipality | Address |
|---|---|---|---|
| BC | ParcelMap BC parcel fabric (DataBC WFS) | BC municipal boundaries (ABMS) | BC Address Geocoder |
| NB | GeoNB Digital Property Maps | GeoNB Local Governance: local governments, rural districts, regional service commissions | OpenStreetMap Nominatim |
| PEI | PEI property parcels | PEI municipal, county and township (Lot) zones | PEI civic addresses |

The base map is © OpenStreetMap contributors © CARTO, and satellite imagery is © Esri. Address search uses the BC Address Geocoder and OpenStreetMap Nominatim. Nominatim allows about one request per second; for heavy traffic, switch to a paid geocoder.

Boundaries are approximate and are not a legal survey. Owner names are not included, because they are not in the open data.
