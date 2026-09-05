import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Circle, CircleMarker, Tooltip, useMap } from 'react-leaflet';

const ZONE_COLORS = {
  property_crime: '#f59e0b',
  violent_crime: '#ef4444',
  collision: '#8b5cf6',
  low_light: '#3b82f6',
  user_reported: '#14b8a6'
};

const ROUTE_COLORS = {
  Fastest: '#ef4444',
  Balanced: '#f59e0b',
  Safer: '#22c55e'
};

function Recenter({ center, active }) {
  const map = useMap();
  useEffect(() => {
    if (active && center) map.panTo(center, { animate: true });
  }, [center, active, map]);
  return null;
}

export default function MapView({
  zones = [],
  places = [],
  routes = [],
  activeRouteId,
  teenLocation,
  trail = [],
  follow = false,
  center = [47.6815, -122.128],
  zoom = 14,
  height = 320
}) {
  return (
    <div className="map-shell" style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="map">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {zones.map((zone) => (
          <Circle
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={zone.radiusMeters}
            pathOptions={{
              color: ZONE_COLORS[zone.type],
              fillColor: ZONE_COLORS[zone.type],
              fillOpacity: 0.14,
              weight: 1
            }}
          >
            <Tooltip>
              <strong>{zone.name}</strong>
              <br />
              severity {zone.severity} · {zone.recencyDays} days ago
            </Tooltip>
          </Circle>
        ))}

        {places.map((place) => (
          <CircleMarker
            key={place.id}
            center={[place.lat, place.lng]}
            radius={6}
            pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9, weight: 2 }}
          >
            <Tooltip>{place.name}</Tooltip>
          </CircleMarker>
        ))}

        {routes.map((route) => {
          const isActive = !activeRouteId || route.routeId === activeRouteId;
          return (
            <Polyline
              key={route.routeId}
              positions={route.points}
              pathOptions={{
                color: ROUTE_COLORS[route.label] || '#2563eb',
                weight: isActive ? 6 : 3,
                opacity: isActive ? 0.95 : 0.35
              }}
            />
          );
        })}

        {trail.length > 1 && (
          <Polyline positions={trail} pathOptions={{ color: '#0f172a', weight: 3, dashArray: '4 6' }} />
        )}

        {teenLocation && (
          <CircleMarker
            center={teenLocation}
            radius={9}
            pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              Teen
            </Tooltip>
          </CircleMarker>
        )}

        <Recenter center={teenLocation} active={follow} />
      </MapContainer>
    </div>
  );
}
