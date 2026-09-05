import fallbackIncidents from "../data/redmondIncidentFallback.js";

export const REDMOND_CRIME_LAYER_URL =
  process.env.REDMOND_CRIME_FEATURE_LAYER_URL ??
  "https://gis.redmond.gov/arcgis/rest/services/CrimeMap/Crimes/FeatureServer/0";

export const INCIDENT_QUERY_DEFAULTS = Object.freeze({
  lookbackDays: 365,
  limit: 500,
  maxLimit: 500,
  timeoutMs: 5_000,
});

const DAY_MS = 86_400_000;
const MAX_BBOX_SPAN_DEGREES = 1;
const OUT_FIELDS = [
  "OBJECTID",
  "LawIncidentNumber",
  "DateTimeReported",
  "OffenseDescription",
  "WebType",
  "WebSubType",
  "FilteredAddress",
];

const CATEGORY_RULES = [
  {
    pattern: /weapon|robbery|homicide|kidnap/i,
    category: "violent_crime",
    incidentType: "violent_offense",
    categoryLabel: "Violent crime",
    severity: 5,
  },
  {
    pattern: /assault/i,
    category: "violent_crime",
    incidentType: "assault",
    categoryLabel: "Assault",
    severity: 5,
  },
  {
    pattern: /arson/i,
    category: "property_crime",
    incidentType: "arson",
    categoryLabel: "Arson",
    severity: 4,
  },
  {
    pattern: /motor vehicle theft|vehicle theft/i,
    category: "property_crime",
    incidentType: "motor_vehicle_theft",
    categoryLabel: "Motor vehicle theft",
    severity: 4,
  },
  {
    pattern: /burglary/i,
    category: "property_crime",
    incidentType: "burglary",
    categoryLabel: "Burglary",
    severity: 3,
  },
  {
    pattern: /car prowl/i,
    category: "property_crime",
    incidentType: "car_prowl",
    categoryLabel: "Car prowl",
    severity: 3,
  },
  {
    pattern: /traffic collision|collision|t\/c/i,
    category: "collision",
    incidentType: "traffic_collision",
    categoryLabel: "Traffic collision",
    severity: 3,
  },
  {
    pattern: /stolen vehicle recovery/i,
    category: "property_crime",
    incidentType: "stolen_vehicle_recovery",
    categoryLabel: "Stolen vehicle recovery",
    severity: 2,
  },
  {
    pattern: /fraud|identity|computer/i,
    category: "property_crime",
    incidentType: "fraud",
    categoryLabel: "Fraud or identity theft",
    severity: 1,
  },
  {
    pattern: /theft/i,
    category: "property_crime",
    incidentType: "theft",
    categoryLabel: "Theft",
    severity: 2,
  },
  {
    pattern: /vandalism/i,
    category: "property_crime",
    incidentType: "vandalism",
    categoryLabel: "Vandalism",
    severity: 2,
  },
  {
    pattern: /drug|alcohol|trespass/i,
    category: "public_order",
    incidentType: "public_order",
    categoryLabel: "Public-order incident",
    severity: 2,
  },
];

export class IncidentQueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "IncidentQueryValidationError";
  }
}

class IncidentUpstreamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IncidentUpstreamError";
    this.code = code;
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoundingBox(value) {
  const parts = Array.isArray(value)
    ? value.map(finiteNumber)
    : String(value ?? "")
        .split(",")
        .map((part) => finiteNumber(part.trim()));

  if (parts.length !== 4 || parts.some((part) => part === null)) {
    throw new IncidentQueryValidationError(
      "bbox must contain west,south,east,north coordinates",
    );
  }

  const [west, south, east, north] = parts;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new IncidentQueryValidationError("bbox coordinates are invalid");
  }

  if (
    east - west > MAX_BBOX_SPAN_DEGREES ||
    north - south > MAX_BBOX_SPAN_DEGREES
  ) {
    throw new IncidentQueryValidationError(
      "bbox is too large; query incidents around the candidate route only",
    );
  }

  return [west, south, east, north];
}

export function parseDate(value, fieldName) {
  const numeric = finiteNumber(value);
  const epoch =
    numeric !== null && Math.abs(numeric) < 100_000_000_000
      ? numeric * 1_000
      : numeric;
  const date = epoch === null ? new Date(value) : new Date(epoch);
  if (Number.isNaN(date.getTime())) {
    throw new IncidentQueryValidationError(`${fieldName} must be a valid date`);
  }
  return date;
}

export function normalizeIncidentCategory(properties = {}) {
  const sourceCategory = [
    properties.WebSubType,
    properties.WebType,
    properties.OffenseDescription,
  ]
    .filter(Boolean)
    .join(" ");
  const match = CATEGORY_RULES.find((rule) => rule.pattern.test(sourceCategory));

  return (
    match ?? {
      category: "other",
      incidentType: "other",
      categoryLabel: "Other reported incident",
      severity: 1,
    }
  );
}

export function normalizeArcGISDate(value) {
  const numeric = finiteNumber(value);
  let date;

  if (numeric !== null) {
    date = new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
  } else {
    date = new Date(value);
  }

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function severityLabel(severity) {
  if (severity >= 5) return "very_high";
  if (severity >= 4) return "high";
  if (severity >= 3) return "moderate";
  if (severity >= 2) return "low";
  return "minimal";
}

function validPointGeometry(geometry) {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return false;
  const [longitude, latitude] = geometry.coordinates.map(finiteNumber);
  return (
    longitude !== null &&
    latitude !== null &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

export function normalizeIncidentFeature(feature, options = {}) {
  if (!validPointGeometry(feature?.geometry)) return null;

  const properties = feature.properties ?? {};
  const reportedAt = normalizeArcGISDate(properties.DateTimeReported);
  const normalized = normalizeIncidentCategory(properties);
  const [longitude, latitude] = feature.geometry.coordinates.map(Number);
  const referenceTime = options.referenceTime
    ? parseDate(options.referenceTime, "referenceTime")
    : new Date();
  const recencyDays = reportedAt
    ? Math.max(0, Math.floor((referenceTime.getTime() - Date.parse(reportedAt)) / DAY_MS))
    : null;
  const sourceId = String(
    properties.OBJECTID ?? feature.id ?? properties.LawIncidentNumber ?? "unknown",
  );

  return {
    type: "Feature",
    id: `redmond-${sourceId}`,
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    properties: {
      id: `redmond-${sourceId}`,
      sourceId,
      incidentNumber: properties.LawIncidentNumber
        ? String(properties.LawIncidentNumber)
        : null,
      category: normalized.category,
      type: normalized.category,
      incidentType: normalized.incidentType,
      categoryLabel: normalized.categoryLabel,
      sourceCategory: properties.WebSubType ?? properties.WebType ?? null,
      severity: normalized.severity,
      severityLabel: severityLabel(normalized.severity),
      reportedAt,
      recencyDays,
      description: properties.OffenseDescription ?? null,
      generalizedLocation: properties.FilteredAddress ?? null,
      lat: latitude,
      lng: longitude,
      radiusMeters: 250,
      source: options.isFallback
        ? "GuardianRoute synthetic incident fallback"
        : "City of Redmond Police open data",
      isFallback: Boolean(options.isFallback),
    },
  };
}

export function buildArcGISIncidentQuery({ bbox, since, until, limit }) {
  const normalizedBbox = parseBoundingBox(bbox);
  const normalizedSince = parseDate(since, "since");
  const normalizedUntil = parseDate(until, "until");
  if (normalizedSince >= normalizedUntil) {
    throw new IncidentQueryValidationError("since must be before until");
  }

  const normalizedLimit = Math.min(
    INCIDENT_QUERY_DEFAULTS.maxLimit,
    Math.max(1, Math.floor(Number(limit) || INCIDENT_QUERY_DEFAULTS.limit)),
  );
  const params = new URLSearchParams({
    where: "1=1",
    geometry: normalizedBbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    outFields: OUT_FIELDS.join(","),
    returnGeometry: "true",
    orderByFields: "DateTimeReported DESC",
    resultOffset: "0",
    resultRecordCount: String(normalizedLimit),
    time: `${normalizedSince.getTime()},${normalizedUntil.getTime()}`,
    f: "geojson",
  });

  return {
    url: `${REDMOND_CRIME_LAYER_URL}/query?${params.toString()}`,
    bbox: normalizedBbox,
    since: normalizedSince,
    until: normalizedUntil,
    limit: normalizedLimit,
  };
}

function upstreamFailureCode(error) {
  if (error instanceof IncidentUpstreamError) return error.code;
  if (error?.name === "AbortError") return "timeout";
  return "upstream_unavailable";
}

async function fetchLiveIncidentCollection(query, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    250,
    Number(options.timeoutMs) || INCIDENT_QUERY_DEFAULTS.timeoutMs,
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(query.url, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new IncidentUpstreamError(
        "upstream_http_error",
        `Redmond ArcGIS returned HTTP ${response.status}`,
      );
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new IncidentUpstreamError(
        "invalid_upstream_response",
        "Redmond ArcGIS did not return JSON",
      );
    }

    if (body?.error) {
      throw new IncidentUpstreamError(
        "upstream_query_error",
        "Redmond ArcGIS rejected the spatial query",
      );
    }
    if (body?.type !== "FeatureCollection" || !Array.isArray(body.features)) {
      throw new IncidentUpstreamError(
        "invalid_upstream_response",
        "Redmond ArcGIS returned an invalid GeoJSON collection",
      );
    }

    return body;
  } catch (error) {
    if (error instanceof IncidentUpstreamError) throw error;
    if (error?.name === "AbortError") {
      throw new IncidentUpstreamError("timeout", "Redmond ArcGIS request timed out");
    }
    throw new IncidentUpstreamError(
      "upstream_unavailable",
      "Redmond ArcGIS is unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function pointInsideBbox(feature, bbox) {
  if (!validPointGeometry(feature?.geometry)) return false;
  const [longitude, latitude] = feature.geometry.coordinates;
  const [west, south, east, north] = bbox;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function featureInsideTimeWindow(feature, since, until) {
  const reportedAt = normalizeArcGISDate(feature?.properties?.DateTimeReported);
  if (!reportedAt) return false;
  const timestamp = Date.parse(reportedAt);
  return timestamp >= since.getTime() && timestamp <= until.getTime();
}

function normalizeCollection(features, query, options = {}) {
  return features
    .slice(0, query.limit)
    .map((feature) =>
      normalizeIncidentFeature(feature, {
        referenceTime: query.until,
        isFallback: options.isFallback,
      }),
    )
    .filter(Boolean);
}

export async function getRedmondIncidents(options = {}) {
  const until = options.until ? parseDate(options.until, "until") : new Date();
  const since = options.since
    ? parseDate(options.since, "since")
    : new Date(until.getTime() - INCIDENT_QUERY_DEFAULTS.lookbackDays * DAY_MS);
  const query = buildArcGISIncidentQuery({
    bbox: options.bbox,
    since,
    until,
    limit: options.limit,
  });
  const queriedAt = new Date().toISOString();

  try {
    const live = await fetchLiveIncidentCollection(query, options);
    const features = normalizeCollection(live.features, query);

    return {
      type: "FeatureCollection",
      features,
      metadata: {
        provider: "City of Redmond",
        source: "Redmond Crime ArcGIS Feature Service",
        sourceUrl: REDMOND_CRIME_LAYER_URL,
        live: true,
        fallback: false,
        queriedAt,
        bbox: query.bbox,
        since: query.since.toISOString(),
        until: query.until.toISOString(),
        limit: query.limit,
        returned: features.length,
        truncated: Boolean(
          live.exceededTransferLimit || live.properties?.exceededTransferLimit,
        ),
      },
    };
  } catch (error) {
    if (!(error instanceof IncidentUpstreamError)) throw error;

    const localFeatures = fallbackIncidents.features
      .filter((feature) => pointInsideBbox(feature, query.bbox))
      .filter((feature) => featureInsideTimeWindow(feature, query.since, query.until));
    const features = normalizeCollection(localFeatures, query, { isFallback: true });

    return {
      type: "FeatureCollection",
      features,
      metadata: {
        provider: "GuardianRoute",
        source: "Deterministic local incident fallback",
        sourceUrl: REDMOND_CRIME_LAYER_URL,
        live: false,
        fallback: true,
        fallbackReason: upstreamFailureCode(error),
        queriedAt,
        bbox: query.bbox,
        since: query.since.toISOString(),
        until: query.until.toISOString(),
        limit: query.limit,
        returned: features.length,
        truncated: false,
      },
    };
  }
}
