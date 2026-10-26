import {image,errorResponse} from "../../../../lib/catalog.mjs";
export async function GET(request: Request) {
  try{const p=new URL(request.url).searchParams;return await image(p.get("path"),p.get("index")||"0");}
  catch(error){return errorResponse(error);}
}
