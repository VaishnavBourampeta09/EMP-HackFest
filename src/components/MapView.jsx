import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

const DEFAULT_CENTER = [47.6815, -122.128];
const MAX_FIT_ZOOM = 16;

const FACTOR_STYLES = {
  property_crime: {
    color: "#806d5a",
    label: "Recent property incident",
  },
  violent_crime: {
    color: "#955f59",
    label: "Recent personal-safety incident",
  },
  collision: {
    color: "#a8793f",
    label: "Traffic conflict",
  },
  low_light: {
    color: "#4f7078",
    label: "Lighting gap",
  },
  user_reported: {
    color: "#6f687d",
    label: "Community observation",
  },
};

const FALLBACK_FACTOR_STYLE = {
  color: "#66736d",
  label: "Environmental factor",
};

const ROUTE_COLORS = {
  Fastest: "#8a5d64",
  Balanced: "#a87535",
  Safer: "#176957",
  "Direct 221": "#176957",
  "Fastest 250": "#8a5d64",
  "221 + 250": "#a87535",
};

function isFiniteNumber(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function isLatLng(point) {
  if (!Array.isArray(point) || point.length < 2) return false;
  if (!isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return false;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  return (
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeLatLng(point) {
  return [Number(point[0]), Number(point[1])];
}

function isGeoJsonCoordinate(point) {
  if (!Array.isArray(point) || point.length < 2) return false;
  if (!isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return false;
  const lng = Number(point[0]);
  const lat = Number(point[1]);
  return (
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function routePoints(route) {
  if (Array.isArray(route?.points)) {
    return route.points.filter(isLatLng).map(normalizeLatLng);
  }

  // Directions APIs commonly return GeoJSON coordinates in lng/lat order.
  if (
    route?.geometry?.type === "LineString" &&
    Array.isArray(route.geometry.coordinates)
  ) {
    return route.geometry.coordinates
      .filter(isGeoJsonCoordinate)
      .map(([lng, lat]) => [Number(lat), Number(lng)])
      .filter(isLatLng);
  }

  return [];
}

function pointSignature(points) {
  if (!points.length) return "empty";

  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];

  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  return [points.length, minLat, maxLat, minLng, maxLng]
    .map((value) => Number(value).toFixed(6))
    .join(":");
}

function moveToPoint(map, point, targetZoom) {
  map.stop();
  map.setView(point, targetZoom, { animate: false });
}

function fitPoints(map, points, fallbackCenter, fallbackZoom) {
  const usablePoints = points.filter(isLatLng);

  if (usablePoints.length === 0) {
    moveToPoint(map, fallbackCenter, fallbackZoom);
    return;
  }

  if (usablePoints.length === 1) {
    moveToPoint(
      map,
      usablePoints[0],
      Math.min(Math.max(map.getZoom(), fallbackZoom), MAX_FIT_ZOOM),
    );
    return;
  }

  map.stop();
  const options = {
    animate: false,
    maxZoom: MAX_FIT_ZOOM,
    paddingTopLeft: [32, 76],
    paddingBottomRight: [32, 52],
  };
  map.fitBounds(usablePoints, options);
}

function MapViewport({
  routePositions,
  teenLocation,
  trail,
  follow,
  fallbackCenter,
  fallbackZoom,
}) {
  const map = useMap();
  const previousRouteSignature = useRef(null);
  const previousFallbackSignature = useRef(null);
  const hadTeenLocation = useRef(false);
  const hadTrail = useRef(false);

  const teenPoint = isLatLng(teenLocation)
    ? normalizeLatLng(teenLocation)
    : null;
  const cleanTrail = useMemo(
    () => trail.filter(isLatLng).map(normalizeLatLng),
    [trail],
  );
  const flattenedRoutes = useMemo(
    () => routePositions.flat(),
    [routePositions],
  );
  const viewportPoints = useMemo(() => {
    const points = flattenedRoutes.length ? [...flattenedRoutes] : [...cleanTrail];
    if (teenPoint) points.push(teenPoint);
    return points;
  }, [cleanTrail, flattenedRoutes, teenPoint]);
  const routesKey = pointSignature(flattenedRoutes);
  const fallbackKey = fallbackCenter.join(":");
  const teenKey = teenPoint?.join(":") ?? "none";

  useEffect(
    () => () => {
      map.stop();
    },
    [map],
  );

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false, pan: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (follow && teenPoint) {
      moveToPoint(map, teenPoint, map.getZoom());
      hadTeenLocation.current = true;
      return;
    }

    const routesChanged = previousRouteSignature.current !== routesKey;
    const centerChanged = previousFallbackSignature.current !== fallbackKey;
    const teenAppeared = Boolean(teenPoint) && !hadTeenLocation.current;
    const trailAppeared = cleanTrail.length > 0 && !hadTrail.current;
    const hasTripContext = flattenedRoutes.length > 0 || cleanTrail.length > 0;

    if (
      routesChanged ||
      teenAppeared ||
      (!flattenedRoutes.length && trailAppeared) ||
      (!hasTripContext && centerChanged)
    ) {
      fitPoints(map, viewportPoints, fallbackCenter, fallbackZoom);
    }

    previousRouteSignature.current = routesKey;
    previousFallbackSignature.current = fallbackKey;
    hadTeenLocation.current = Boolean(teenPoint);
    hadTrail.current = cleanTrail.length > 0;
  }, [
    cleanTrail,
    fallbackCenter,
    fallbackKey,
    fallbackZoom,
    flattenedRoutes,
    follow,
    map,
    routesKey,
    teenKey,
    teenPoint,
    viewportPoints,
  ]);

  return null;
}

function RouteLine({ route, positions, state, onRouteSelect }) {
  const lineRef = useRef(null);
  const hitAreaRef = useRef(null);
  const isSelected = state === "selected";
  const isUnselected = state === "unselected";
  const isInteractive = typeof onRouteSelect === "function";
  const color = route.color || ROUTE_COLORS[route.label] || "#315f72";
  const routeName = route.label ? `${route.label} route` : "Route option";
  const detail = [
    isFiniteNumber(route.durationMinutes)
      ? `${route.durationMinutes} minutes`
      : null,
    isFiniteNumber(route.distanceKm) ? `${route.distanceKm} kilometers` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const accessibleLabel = [
    routeName,
    detail,
    isSelected ? "selected" : null,
    isInteractive ? "Press Enter to select" : null,
  ]
    .filter(Boolean)
    .join(". ");

  const lineOptions = {
    color,
    dashArray: isUnselected ? "3 9" : undefined,
    lineCap: "round",
    lineJoin: "round",
    opacity: isUnselected ? 0.48 : state === "available" ? 0.78 : 0.96,
    weight: isSelected ? 7 : isUnselected ? 3.5 : 5,
    className: `map-route map-route--${state}`,
  };

  useEffect(() => {
    const element = hitAreaRef.current?.getElement();
    if (!element) return undefined;

    element.setAttribute("aria-label", accessibleLabel);
    element.setAttribute("role", isInteractive ? "button" : "img");

    if (!isInteractive) {
      element.removeAttribute("tabindex");
      return undefined;
    }

    element.setAttribute("tabindex", "0");
    const handleKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onRouteSelect(route, event);
    };
    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [accessibleLabel, isInteractive, onRouteSelect, route]);

  useEffect(() => {
    if (!isSelected) return;
    lineRef.current?.bringToFront();
    hitAreaRef.current?.bringToFront();
  }, [isSelected]);

  const setHovered = (hovered) => {
    lineRef.current?.setStyle({
      opacity: hovered ? 1 : lineOptions.opacity,
      weight: hovered ? lineOptions.weight + 1.5 : lineOptions.weight,
    });
  };

  return (
    <>
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{
          color: "#fffdf8",
          dashArray: lineOptions.dashArray,
          lineCap: "round",
          lineJoin: "round",
          opacity: isUnselected ? 0.48 : 0.88,
          weight: lineOptions.weight + 3.5,
          className: `map-route-casing map-route-casing--${state}`,
        }}
      />
      <Polyline ref={lineRef} positions={positions} pathOptions={lineOptions} />
      <Polyline
        ref={hitAreaRef}
        positions={positions}
        eventHandlers={{
          click: (event) => onRouteSelect?.(route, event),
          mouseout: () => setHovered(false),
          mouseover: () => setHovered(true),
        }}
        pathOptions={{
          bubblingMouseEvents: false,
          color,
          opacity: 0,
          weight: 18,
          className: `map-route-hitarea map-route-hitarea--${state}`,
        }}
      >
        <Tooltip sticky className="map-route-tooltip">
          <strong>{routeName}</strong>
          {detail && <span className="map-route-tooltip__detail"> · {detail}</span>}
          {route.summary && (
            <span className="map-route-tooltip__summary">
              <br />
              {route.summary}
            </span>
          )}
        </Tooltip>
      </Polyline>
    </>
  );
}

function FactorMarker({ factor }) {
  const markerRef = useRef(null);
  const style = FACTOR_STYLES[factor.type] || FALLBACK_FACTOR_STYLE;
  const severity = isFiniteNumber(factor.severity)
    ? Math.max(1, Math.min(5, Number(factor.severity)))
    : 1;
  const radius = 3.5 + severity * 0.45;
  const recency = isFiniteNumber(factor.recencyDays)
    ? `Observed ${factor.recencyDays} days ago`
    : null;
  const scoreImpact = `Route-score impact ${severity} of 5`;
  const accessibleLabel = [
    factor.name || style.label,
    style.label,
    scoreImpact,
    recency,
  ]
    .filter(Boolean)
    .join(". ");

  useEffect(() => {
    const marker = markerRef.current;
    const element = marker?.getElement();
    if (!element) return undefined;

    element.setAttribute("aria-label", accessibleLabel);
    element.setAttribute("role", "img");
    element.setAttribute("tabindex", "0");
    const openTooltip = () => marker.openTooltip();
    const closeTooltip = () => marker.closeTooltip();
    element.addEventListener("focus", openTooltip);
    element.addEventListener("blur", closeTooltip);
    return () => {
      element.removeEventListener("focus", openTooltip);
      element.removeEventListener("blur", closeTooltip);
    };
  }, [accessibleLabel]);

  return (
    <CircleMarker
      ref={markerRef}
      center={[Number(factor.lat), Number(factor.lng)]}
      radius={radius}
      pathOptions={{
        color: "#fffdf8",
        fillColor: style.color,
        fillOpacity: 0.9,
        opacity: 0.96,
        weight: 1.75,
        className: `map-factor-marker map-factor-marker--${factor.type || "other"}`,
      }}
    >
      <Tooltip className="map-factor-tooltip">
        <strong>{factor.name || style.label}</strong>
        <span className="map-factor-tooltip__type">
          <br />
          {style.label} · {scoreImpact}
        </span>
        {recency && (
          <span className="map-factor-tooltip__recency">
            <br />
            {recency}
          </span>
        )}
        {factor.source && (
          <span className="map-factor-tooltip__source">
            <br />
            Source: {factor.source}
          </span>
        )}
      </Tooltip>
    </CircleMarker>
  );
}

function RecenterControl({
  points,
  teenLocation,
  follow,
  fallbackCenter,
  fallbackZoom,
}) {
  const map = useMap();
  const hasTeenLocation = isLatLng(teenLocation);
  const label =
    follow && hasTeenLocation
      ? "Center on live location"
      : points.length
        ? "Fit the full trip in view"
        : "Return to the default map view";

  const stopPropagation = (event) => event.stopPropagation();
  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (follow && hasTeenLocation) {
      moveToPoint(map, normalizeLatLng(teenLocation), map.getZoom());
      return;
    }
    fitPoints(map, points, fallbackCenter, fallbackZoom);
  };

  return (
    <div
      className="map-recenter leaflet-bottom leaflet-right"
      onDoubleClick={stopPropagation}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      onTouchStart={stopPropagation}
      onWheel={stopPropagation}
    >
      <button
        type="button"
        className="map-recenter__button leaflet-control"
        aria-label={label}
        title={label}
        onClick={handleClick}
      >
        <svg
          className="map-recenter__icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  );
}

function MapLegend({ factors, routes, activeRouteId }) {
  const presentFactorTypes = useMemo(() => {
    const types = new Set(factors.map((factor) => factor.type));
    return Object.entries(FACTOR_STYLES).filter(([type]) => types.has(type));
  }, [factors]);
  const sourceNames = useMemo(
    () => [...new Set(factors.map((factor) => factor.source).filter(Boolean))],
    [factors],
  );
  const selectedRoute = routes.find(
    ({ route }) => route.routeId === activeRouteId,
  )?.route;
  const displayRoute = selectedRoute || (routes.length === 1 ? routes[0].route : null);
  const sourceLabel = factors.length
    ? "Objective factors · Redmond-area demo data"
    : "Map tiles · OpenStreetMap";

  const stopPropagation = (event) => event.stopPropagation();

  return (
    <>
      {routes.length > 0 && (
        <div className="map-route-status leaflet-top leaflet-left">
          <div
            className="map-route-status__panel leaflet-control"
            role="status"
            aria-live="polite"
          >
            <span className="map-route-status__label">
              {displayRoute ? "Route in view" : `${routes.length} route options`}
            </span>
            {displayRoute && (
              <strong className="map-route-status__value">
                {displayRoute.label || "Selected"}
                {isFiniteNumber(displayRoute.durationMinutes)
                  ? ` · ${displayRoute.durationMinutes} min`
                  : ""}
              </strong>
            )}
          </div>
        </div>
      )}

      <aside
        className="map-legend leaflet-bottom leaflet-left"
        aria-label="Map legend and data sources"
        onDoubleClick={stopPropagation}
        onMouseDown={stopPropagation}
        onPointerDown={stopPropagation}
        onTouchStart={stopPropagation}
        onWheel={stopPropagation}
      >
        <div className="map-legend__panel leaflet-control">
          {(presentFactorTypes.length > 0 || routes.length > 1) && (
            <>
              <strong className="map-legend__title">Map key</strong>
              <ul className="map-legend__list">
                {routes.length > 1 && (
                  <>
                    <li className="map-legend__item">
                      <span
                        className="map-legend__route-line map-legend__route-line--selected"
                        aria-hidden="true"
                      />
                      Selected route
                    </li>
                    <li className="map-legend__item">
                      <span
                        className="map-legend__route-line map-legend__route-line--alternative"
                        aria-hidden="true"
                      />
                      Other route
                    </li>
                  </>
                )}
                {presentFactorTypes.map(([type, style]) => (
                  <li className="map-legend__item" key={type}>
                    <span
                      className={`map-legend__factor map-legend__factor--${type}`}
                      style={{ backgroundColor: style.color }}
                      aria-hidden="true"
                    />
                    {style.label}
                  </li>
                ))}
              </ul>
            </>
          )}
          <span
            className="map-legend__source"
            title={sourceNames.length ? sourceNames.join("; ") : sourceLabel}
          >
            {sourceLabel}
          </span>
        </div>
      </aside>
    </>
  );
}

export default function MapView({
  zones = [],
  places = [],
  routes = [],
  activeRouteId,
  teenLocation,
  trail = [],
  follow = false,
  center = DEFAULT_CENTER,
  zoom = 14,
  height = 320,
  onRouteSelect,
}) {
  const fallbackCenter = isLatLng(center)
    ? normalizeLatLng(center)
    : DEFAULT_CENTER;
  const preparedRoutes = useMemo(
    () =>
      routes
        .map((route, index) => ({
          route,
          index,
          positions: routePoints(route),
        }))
        .filter(({ positions }) => positions.length > 1),
    [routes],
  );
  const hasSelectedRoute = activeRouteId !== undefined && activeRouteId !== null;
  const orderedRoutes = useMemo(
    () =>
      [...preparedRoutes].sort((a, b) => {
        const aSelected = a.route.routeId === activeRouteId;
        const bSelected = b.route.routeId === activeRouteId;
        return Number(aSelected) - Number(bSelected) || a.index - b.index;
      }),
    [activeRouteId, preparedRoutes],
  );
  const routePositions = useMemo(
    () => preparedRoutes.map(({ positions }) => positions),
    [preparedRoutes],
  );
  const cleanTrail = useMemo(
    () => trail.filter(isLatLng).map(normalizeLatLng),
    [trail],
  );
  const focusPoints = useMemo(() => {
    const points = routePositions.flat();
    if (!points.length) points.push(...cleanTrail);
    if (isLatLng(teenLocation)) points.push(normalizeLatLng(teenLocation));
    return points;
  }, [cleanTrail, routePositions, teenLocation]);
  const objectiveFactors = useMemo(
    () => zones.filter((factor) => isLatLng([factor?.lat, factor?.lng])),
    [zones],
  );
  const validPlaces = useMemo(
    () => places.filter((place) => isLatLng([place?.lat, place?.lng])),
    [places],
  );

  return (
    <section
      className="map-shell guardian-map-shell"
      style={{ height }}
      role="region"
      aria-label="Interactive GuardianRoute trip map"
    >
      <MapContainer
        center={fallbackCenter}
        zoom={zoom}
        scrollWheelZoom
        keyboard
        className="map guardian-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          className="guardian-map__tiles"
        />

        {objectiveFactors.map((factor, index) => (
          <FactorMarker
            key={factor.id || `${factor.type || "factor"}-${index}`}
            factor={factor}
          />
        ))}

        {validPlaces.map((place, index) => (
          <CircleMarker
            key={place.id || `place-${index}`}
            center={[Number(place.lat), Number(place.lng)]}
            radius={5.5}
            pathOptions={{
              color: "#fffdf8",
              fillColor: "#315f72",
              fillOpacity: 0.96,
              opacity: 1,
              weight: 2,
              className: "map-place-marker",
            }}
          >
            <Tooltip className="map-place-tooltip">
              {place.name || "Helpful place"}
            </Tooltip>
          </CircleMarker>
        ))}

        {orderedRoutes.map(({ route, positions, index }) => {
          const isSelected = route.routeId === activeRouteId;
          const state = hasSelectedRoute
            ? isSelected
              ? "selected"
              : "unselected"
            : "available";
          return (
            <RouteLine
              key={route.routeId || `route-${index}`}
              route={route}
              positions={positions}
              state={state}
              onRouteSelect={onRouteSelect}
            />
          );
        })}

        {cleanTrail.length > 1 && (
          <Polyline
            positions={cleanTrail}
            interactive={false}
            pathOptions={{
              color: "#243a42",
              weight: 3,
              opacity: 0.72,
              dashArray: "3 7",
              lineCap: "round",
              className: "map-live-trail",
            }}
          />
        )}

        {isLatLng(teenLocation) && (
          <CircleMarker
            center={normalizeLatLng(teenLocation)}
            radius={8}
            pathOptions={{
              color: "#fffdf8",
              fillColor: "#176957",
              fillOpacity: 1,
              opacity: 1,
              weight: 3,
              className: "map-teen-marker",
            }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -8]}
              className="map-teen-tooltip"
            >
              Live location
            </Tooltip>
          </CircleMarker>
        )}

        <MapViewport
          routePositions={routePositions}
          teenLocation={teenLocation}
          trail={cleanTrail}
          follow={follow}
          fallbackCenter={fallbackCenter}
          fallbackZoom={zoom}
        />
        <RecenterControl
          points={focusPoints}
          teenLocation={teenLocation}
          follow={follow}
          fallbackCenter={fallbackCenter}
          fallbackZoom={zoom}
        />
        <MapLegend
          factors={objectiveFactors}
          routes={preparedRoutes}
          activeRouteId={activeRouteId}
        />
      </MapContainer>
    </section>
  );
}
