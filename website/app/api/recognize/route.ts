import {recognize} from "../../../lib/vision.mjs";
export async function POST(request: Request) {
  return recognize(request);
}
