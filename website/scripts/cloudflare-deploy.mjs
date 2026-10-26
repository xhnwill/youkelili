/** Build first, then deploy only the explicit account/name/domain in cloudflare.json. */
import {readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const target=JSON.parse(readFileSync(path.join(root,"cloudflare.json"),"utf8"));
if(!target.account_id||!target.name||!target.routes?.every(r=>r.custom_domain&&r.pattern))throw new Error("Explicit Cloudflare target required.");
const config=JSON.parse(readFileSync(path.join(root,"dist/server/wrangler.json"),"utf8"));
const output=path.join(root,"dist/server/wrangler.cloudflare.json");
writeFileSync(output,JSON.stringify({...config,...target},null,2)+"\n");
const result=spawnSync(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),"deploy","--config",output,"--keep-vars",...process.argv.slice(2)],{cwd:root,stdio:"inherit",env:process.env});
process.exitCode=result.status??1;
