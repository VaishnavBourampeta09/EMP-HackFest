// Synthetic, fixed records used only when the City of Redmond service is unavailable.
// Keeping them in ArcGIS's source shape exercises the same normalization path as live data.
const redmondIncidentFallback = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "fallback-001",
      geometry: { type: "Point", coordinates: [-122.1333, 47.6693] },
      properties: {
        OBJECTID: "fallback-001",
        LawIncidentNumber: "DEMO-001",
        DateTimeReported: "2026-08-21T20:15:00.000Z",
        OffenseDescription: "Assault report",
        WebType: "Person Crime",
        WebSubType: "Assault",
        FilteredAddress: "Old Redmond Road area",
      },
    },
    {
      type: "Feature",
      id: "fallback-002",
      geometry: { type: "Point", coordinates: [-122.1262, 47.6702] },
      properties: {
        OBJECTID: "fallback-002",
        LawIncidentNumber: "DEMO-002",
        DateTimeReported: "2026-07-30T03:40:00.000Z",
        OffenseDescription: "Vehicle prowl report",
        WebType: "Property Crime",
        WebSubType: "Car Prowl",
        FilteredAddress: "Redmond Town Center area",
      },
    },
    {
      type: "Feature",
      id: "fallback-003",
      geometry: { type: "Point", coordinates: [-122.118, 47.6685] },
      properties: {
        OBJECTID: "fallback-003",
        LawIncidentNumber: "DEMO-003",
        DateTimeReported: "2026-06-12T22:05:00.000Z",
        OffenseDescription: "Vehicle collision report",
        WebType: "Other",
        WebSubType: "Traffic Collision",
        FilteredAddress: "Downtown Redmond area",
      },
    },
    {
      type: "Feature",
      id: "fallback-004",
      geometry: { type: "Point", coordinates: [-122.1163, 47.6764] },
      properties: {
        OBJECTID: "fallback-004",
        LawIncidentNumber: "DEMO-004",
        DateTimeReported: "2026-05-03T17:30:00.000Z",
        OffenseDescription: "Theft report",
        WebType: "Property Crime",
        WebSubType: "Theft",
        FilteredAddress: "Bear Creek Trail area",
      },
    },
    {
      type: "Feature",
      id: "fallback-005",
      geometry: { type: "Point", coordinates: [-122.1291, 47.6749] },
      properties: {
        OBJECTID: "fallback-005",
        LawIncidentNumber: "DEMO-005",
        DateTimeReported: "2026-02-17T06:50:00.000Z",
        OffenseDescription: "Criminal trespass report",
        WebType: "Other",
        WebSubType: "Criminal Trespass",
        FilteredAddress: "Downtown transit center area",
      },
    },
  ],
};

export default redmondIncidentFallback;
