import { haversineMeters } from './GEO.JS';

export const ZONE_LABELS = {
  property_crime: 'property-incident',
  violent_crime: 'personal-safety incident',
  collision: 'high-collision',
  low_light: 'poorly lit',
  user_reported: 'community-observation'
};


export function findNearbyIncidentZone(location, incidentZones) {
  let closest = null;
  let closestDistance = Infinity;
  for (const zone of incidentZones) {
    const distance = haversineMeters(location, [zone.lat, zone.lng]);
    if (distance <= zone.radiusMeters && distance < closestDistance) {
      closest = zone;
      closestDistance = distance;
    }
  }
  return closest;
}
