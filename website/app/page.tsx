import Script from "next/script";
import markup from "./workbench";
export default function Home() { return <><div dangerouslySetInnerHTML={{__html:markup}} /><Script src="/app.js" type="module" strategy="afterInteractive" /></>; }
