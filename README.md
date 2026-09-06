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

Routing and geocoding fall back to public Valhalla + Nominatim with no API keys,
which is enough for walking routes. Transit needs an `OTP_URL` pointing at an
OpenTripPlanner instance with local GTFS data; without one the planner shows a
clear "no transit itinerary" message. Copy `.env.example` to `.env` to configure
providers.

Open the printed URL on a phone or in a narrow browser window. Use the Teen / Parent toggle in the header. Opening the app in two tabs keeps both views in sync (BroadcastChannel), so one screen can be the teen and the other the parent.

## Demo script

1. Teen mode: pick **Home** as the destination.
2. Three routes appear with explainable safety scores — Fastest (High risk), Balanced (Medium), Safer (Low).
3. Pick the Safer route and start the trip. Switch to Parent mode: the trip, ETA, route safety and last-update time are live.
4. Back in Teen mode, press **Take a detour** in the demo bar. The app detects the deviation and asks the teen "Are you okay?" with a countdown.
5. Ignore the check-in. It expires and the parent dashboard shows a high-severity **Missed check-in** alert with Call teen / Navigate there / Call 911.
6. Press **Stop here** to demo the long-stop check-in, or the **Need help** button for an instant SOS escalation.

## How risk scoring works

`src/logic/riskScoring.js`

```
route_risk_score = incident_zone_score + collision_zone_score + nighttime_score - safe_place_bonus

zone_score  = severity * recency_weight * distance_weight
recency     = 0-7d: 3, 8-30d: 2, 31-90d: 1, older: 0.5
distance    = route crosses zone: 3, within 300m of the zone edge: 1.5
levels      = 0-20 Low, 21-50 Medium, 51-100 High
```

Every score comes with plain-English reasons, e.g. *"Passes directly through 2 property crime zones"*, because the explanation matters more than the math.

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
  logic/       geo.js, riskScoring.js, routeDeviation.js, tripMonitoring.js
  actions.js   trip lifecycle: plan, start, location updates, check-ins, alerts
  store.js     shared state, localStorage persistence, cross-tab sync
```

## Privacy design

Location is shared only while a trip is active, kept as trip history, and cleared with the trip. No always-on tracking. The parent is escalated to only after the teen has been asked first.

## Hackathon hand-waves

Preloaded demo routes instead of a live routing API, seeded JSON incident zones instead of a live crime feed, hardcoded demo family, in-app parent alerts instead of SMS, and a simulated location feed instead of background GPS.
