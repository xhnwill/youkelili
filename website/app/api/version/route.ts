import {VERSION,BUILD_DATE} from "../../../public/core.mjs";
export function GET() {
  return Response.json({name:"JianpuUke",version:VERSION,buildDate:BUILD_DATE,mode:"web",platform:"cloudflare-workers"},{headers:{"Cache-Control":"no-store"}});
}
