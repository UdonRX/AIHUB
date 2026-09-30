import {NextResponse} from "next/server";
import {status} from "../../../lib/router";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await status(),{headers:{"cache-control":"no-store"}})}
