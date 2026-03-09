/**
 * Supabase Edge Function — static SPA host
 *
 * Serves the contents of the `public/` directory with correct MIME types so
 * that browsers render the application instead of downloading raw bytes.
 *
 * Deployment
 * ----------
 * Run the following from the repository root:
 * 1. (If symlinks are not resolved automatically) copy files into this directory:
 *      cp public/{index.html,style.css,app-modular.js,logo-jcc.png} supabase/functions/app/
 * 2. Deploy:
 *      supabase functions deploy app --project-ref <your-project-ref>
 *
 * Live URL
 * --------
 * https://<your-project-ref>.supabase.co/functions/v1/app
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

const STATIC_FILES = new Set([
  "style.css",
  "app-modular.js",
  "logo-jcc.png",
]);

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Strip the function base path to get the requested file name.
  // e.g. /functions/v1/app/style.css  →  style.css
  const file = url.pathname
    .replace(/^\/functions\/v1\/app\/?/, "")
    .replace(/^\/+/, "");

  if (STATIC_FILES.has(file)) {
    // Serve a known static asset with the correct Content-Type.
    // STATIC_FILES contains only entries with a dot in the name, so
    // lastIndexOf('.') is guaranteed to be >= 0 here.
    try {
      const data = await Deno.readFile(`./${file}`);
      const ext = file.slice(file.lastIndexOf(".")) as keyof typeof MIME;
      return new Response(data, {
        headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  // Everything else (root, deep paths, unknown routes) → serve index.html.
  // Inject a <base> tag so that relative asset URLs resolve correctly
  // regardless of whether the visitor used a trailing slash.
  // url.pathname has query strings already stripped by the URL constructor.
  try {
    const raw = await Deno.readFile("./index.html");
    const basePath = url.pathname.endsWith("/")
      ? url.pathname
      : url.pathname + "/";
    const html = new TextDecoder()
      .decode(raw)
      .replace("<head>", `<head>\n  <base href="${basePath}">`);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
