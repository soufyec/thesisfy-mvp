import { NextResponse } from "next/server";

/** CORS for endpoints used by the browser extension and native mobile wrapper. */
export function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export function preflight() {
  return withCors(new NextResponse(null, { status: 204 }));
}
