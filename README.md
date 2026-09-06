# Sentinel

**Maps get you home. Sentinel makes sure you get home safely.**

Parents today can see where their teen is, but they usually find out after something is wrong. Sentinel proactively chooses safer routes, monitors the trip, checks in with the teen when risk changes, and alerts the parent only when needed.

This is a web app (Next.js + React + Leaflet/OpenStreetMap) built for a hackathon MVP. It is **not** a crime prediction system — it is a route planner that uses recent incident zones and traffic collision zones to recommend safer paths and trigger parent check-ins.

## Run it

Dependencies are already vendored in `node_modules`, so no install step is needed.
Invoke the local Next binary directly:

```
node_modules/.bin/next dev      # http://localhost:3000
node_modules/.bin/next build    # production build
```

Walking uses the public Valhalla service; transit uses Transitous with the server's current time. No database or new hosted service is required. Mapbox geocoding and an existing OTP instance remain optional.

## Route scoring

The planner accepts `origin`, `destination`, `mode: walking | transit`, and `safetyMode: day | night`. Both `/api/plan` and `/api/routes` return the same scored contract. Day/Night is chosen explicitly and never changes the transit timetable.

Walking first requests Valhalla alternatives, then tries at most two through-waypoints on opposite sides of the trip corridor when fewer than three distinct routes remain. The waypoint offset scales with trip distance (150–350 m). Routes sharing at least 70% of both paths within 30 m are merged; routes over 1.8× baseline duration are discarded. Waypoints shape actual walkable routes and are not claimed to be safe places. An unavailable detour preserves the successful routes. The adapter makes at most three rate-limited requests. Scoring happens after all candidates are generated, using one shared incident envelope.

Every distinct report within 100 m of the assessed walking geometry counts equally. Divide by assessed walking kilometres. The sole calibration constant is 0.03 points per incident/km (about 333 reports/km reaches zero). This makes incident-driven score differences 50% larger before the score reaches its floor:

- Day: `max(0, 10 - 0.03 * incidentsPerKm)`.
- Night: half the Day score plus `5 * (1 - unlitFraction)`.
- Unknown-majority lighting receives a neutral 2.5 lighting points at night.
- Transit assesses access, transfer, and final walks only. A trip with no assessable walking geometry returns a null score instead of dividing by zero.

Lighting uses equal-distance samples approximately 25 m apart and the nearest explicitly tagged segment within 20 m. At least half of walking distance must have known lighting to return an unlit percentage. Absence of an OSM tag is unknown, not unlit.

`src/data/redmondLightingSegments.json` is the local OSM snapshot. Refresh manually with `pnpm data:refresh-lighting`; Overpass is never contacted during planning. Source/date and OSM attribution are retained. Incident data retains the existing one-year query window and synthetic local fallback, identified in response metadata; report ages and categories are for map context only. Incident feed truncation is also reported in metadata.

Route safety fields: `safetyMode`, `safetyScore`, `incidentCount`, `incidentsPerKm`, `unlitPercent`, `lightingDataAvailable`, and `recommended`. Existing geometry, navigation legs, duration and distance remain. No prose summary or legacy risk fields are returned.

Public Valhalla requests are spaced at least one second apart within the running app process. This supports a single-process hackathon demo; multiple replicas would need a shared limiter or dedicated provider. One request per action alone does not enforce a global rate limit. The public service has no availability guarantee. See [FOSSGIS terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/).

Open the printed URL on a phone or in a narrow browser window. Use the Teen / Parent toggle in the header. Opening the app in two tabs keeps both views in sync (BroadcastChannel), so one screen can be the teen and the other the parent.

## Demo script

1. Teen mode: pick **Home** as the destination.
2. One to three routes appear with Safety Scores out of 10.
3. Pick the recommended route and start the trip. Switch to Parent mode: the trip, ETA, route safety and last-update time are live.
4. Back in Teen mode, press **Take a detour** in the demo bar. The app detects the deviation and asks the teen "Are you okay?" with a countdown.
5. Ignore the check-in. It expires and the parent dashboard shows a high-severity **Missed check-in** alert with Call teen / Navigate there / Call 911.
6. Press **Stop here** to demo the long-stop check-in, or the **Need help** button for an instant SOS escalation.

## Proactive monitoring

`src/logic/tripMonitoring.js`

| Trigger | Teen prompt | Parent alert condition |
| --- | --- | --- |
| Route deviation > 300 m | "You left the planned route. Are you okay?" | No response before the countdown ends |
| Stopped 5+ minutes | "You have been stopped for N minutes. Everything okay?" | No response |
| Entered incident zone | "This area has recent reports. Continue or reroute?" | Teen asks for help or misses the check-in |
| ETA slipped 10+ minutes | "Your ETA changed a lot. Still okay?" | No response |
| Manual SOS | "Help request sent" | Immediate alert |

## Data

`src/data/incident_zones.json` holds 24 demo zones around Redmond (property crime, violent crime, collision, low light, community reported), each with severity, recency and radius. They are modelled on Redmond's public crime map / police dashboards and the Safer Streets Redmond traffic safety program, and are clearly labelled as demo data.

`src/data/safe_places.json` holds trusted places (home, school, Redmond Library, Marymoor Park, Downtown Redmond Station).

`src/data/demo_routes.json` holds three preloaded Redmond Library to Home routes plus a detour path used by the simulator.

## Structure

```
src/
  components/  MapView, RouteCard, TeenTripScreen, ParentDashboard, AlertCard, CheckinSheet
  data/        incident_zones.json, demo_routes.json, demo_users.json, safe_places.json
  logic/       geo.js, safetyScoring.js, routeDeviation.js, tripMonitoring.js
  actions.js   trip lifecycle: plan, start, location updates, check-ins, alerts
  store.js     shared state, localStorage persistence, cross-tab sync
```

## Privacy design

Location is shared only while a trip is active, kept as trip history, and cleared with the trip. No always-on tracking. The parent is escalated to only after the teen has been asked first.

## Hackathon hand-waves

Live public routing and incident feeds, a local OSM lighting snapshot, hardcoded demo family, in-app parent alerts instead of SMS, and a simulated location feed instead of background GPS.
