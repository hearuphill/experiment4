import { parse } from "./xml.js";

const res = await fetch("https://cors.488848.xyz/http://ws.webxml.com.cn/WebServices/WeatherWS.asmx/getWeather", {
    method: "POST",
    body: new URLSearchParams({ theCityCode: "1117", theUserID: "" }),
});

const xml = parse(await res.text());

const { string } = xml.ArrayOfString;

const result = string
    .map(String)
    .filter((str) => !str.endsWith(".gif"))
    .join("\n");

const isBrowser = typeof window != undefined && typeof window.document != undefined;
if (isBrowser) {
    document.querySelector("pre").innerHTML = result;
} else {
    // you can run it using deno or node.js
    console.log(result);
}
