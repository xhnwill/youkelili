import {detail,errorResponse} from "../../../../lib/catalog.mjs";
export async function GET(request: Request) {
  try{return Response.json(await detail(new URL(request.url).searchParams.get("path")),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return errorResponse(error);}
}
