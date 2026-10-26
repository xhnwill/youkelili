import {listing,errorResponse} from "../../../lib/catalog.mjs";
export async function GET(request: Request) {
  try{return Response.json(await listing(new URL(request.url).searchParams),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return errorResponse(error);}
}
