import { NextResponse } from "next/server";
import {
  getRedmondIncidents,
  IncidentQueryValidationError,
} from "../../../lib/redmondIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readLimit(value) {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new IncidentQueryValidationError("limit must be a positive integer");
  }
  return parsed;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = await getRedmondIncidents({
      bbox: searchParams.get("bbox"),
      since: searchParams.get("since") || undefined,
      until: searchParams.get("until") || undefined,
      limit: readLimit(searchParams.get("limit")),
    });
    const headers = new Headers({
      "Content-Type": "application/geo+json; charset=utf-8",
      "X-Escort-Data-Source": collection.metadata.fallback
        ? "fallback"
        : "redmond-live",
      "Cache-Control": collection.metadata.fallback
        ? "no-store"
        : "public, s-maxage=300, stale-while-revalidate=600",
    });

    return NextResponse.json(collection, { headers });
  } catch (error) {
    if (error instanceof IncidentQueryValidationError) {
      return NextResponse.json(
        {
          error: "invalid_incident_query",
          message: error.message,
        },
        { status: 400 },
      );
    }

    console.error("Unexpected incident API failure", error);
    return NextResponse.json(
      {
        error: "incident_query_failed",
        message: "The incident query could not be completed.",
      },
      { status: 500 },
    );
  }
}
