import type { APIRoute } from "astro";

// The one public page, so a crawler finds it without following links.
export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? "https://yotrade.xyz";
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
