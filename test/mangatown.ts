import axios from "axios";
import * as cheerio from "cheerio";

const url = "https://www.mangatown.com/manga/world_customize_creator/c001/";

console.log("Fetching chapter page...");
const { data } = await axios.get(url, { timeout: 15000 });
const $ = cheerio.load(data);

console.log("Page size:", data.length, "bytes");
console.log("Title:", $("title").text());

// 1. Check page navigator select
const pageNav = $('select[onchange*="location.href"]');
console.log(`\nPage nav selects found: ${pageNav.length}`);

const firstNav = pageNav.first();
console.log("First nav options total:", firstNav.find("option").length);

const pageOptions = firstNav.find("option").filter((_, el) => {
  const t = $(el).text().trim();
  const isDigit = /^\d+$/.test(t);
  console.log(`  option: text="${t}" isDigit=${isDigit} value="${$(el).attr('value')}"`);
  return isDigit;
});

console.log(`\nFiltered page count: ${pageOptions.length}`);

// 2. Check image
const img = $("img#image");
console.log(`\nImage found: ${img.length}`);
if (img.length) {
  console.log("  src:", img.attr("src"));
  console.log("  alt:", img.attr("alt"));
}

// 3. Test page 2
console.log("\n--- Testing page 2 ---");
try {
  const { data: p2 } = await axios.get(`${url.replace(/\/$/, "")}/2.html`, { timeout: 15000 });
  const $2 = cheerio.load(p2);
  const img2 = $2("img#image");
  console.log("Page 2 image:", img2.attr("src") || "NOT FOUND");
} catch (e: any) {
  console.log("Page 2 error:", e.message);
}
