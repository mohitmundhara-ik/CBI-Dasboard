// middleware.js — the gate. Put this in the repo root, beside package.json.
//
// Vercel runs this before anything is served. Without a valid session cookie the
// dashboard is never sent to the browser at all — which is the whole point. A
// sign-in screen inside the HTML would look like security while shipping every
// number to anyone who opened the file.
//
// Environment variables:
//   AUTH_SECRET          any long random string, used to sign the session cookie
//   GOOGLE_CLIENT_ID     the OAuth client ID from Google Cloud
//   ALLOWED_DOMAIN       interviewkickstart.com
//   ALLOWED_EMAILS       theailabdaily@gmail.com,mohitmundhara8@gmail.com

export const config = {
  matcher: ["/((?!api/auth|api/whoami|_next|favicon.ico|login).*)"],
};

const enc = new TextEncoder();

async function verify(token, secret) {
  try {
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      "HMAC", key,
      Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
      enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.exp && claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch { return null; }
}

export default async function middleware(req) {
  const url = new URL(req.url);

  // The API routes carry their own key check, so leave them alone.
  if (url.pathname.startsWith("/api/")) return;

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return new Response(
      page("Set AUTH_SECRET in Vercel", "The gate cannot run without a signing secret. Add AUTH_SECRET, then redeploy."),
      { status: 500, headers: { "content-type": "text/html" } });
  }

  const cookie = (req.headers.get("cookie") || "")
    .split(";").map(s => s.trim()).find(s => s.startsWith("cbi_session="));
  const claims = cookie ? await verify(cookie.slice("cbi_session=".length), secret) : null;

  if (claims) return; // let them through

  return new Response(signin(process.env.GOOGLE_CLIENT_ID || ""), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(title, msg) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:Inter,system-ui,sans-serif;background:#F7F9FB;color:#0F1E2E;
  display:grid;place-items:center;height:100vh;margin:0}
  .c{background:#fff;border:1px solid #E1E8EF;border-radius:12px;padding:34px 38px;max-width:460px;
  box-shadow:0 4px 20px rgba(11,37,69,.08)}h1{font-size:19px;margin:0 0 10px}
  p{color:#6B8199;font-size:13.5px;line-height:1.65;margin:0}</style>
  <div class="c"><h1>${title}</h1><p>${msg}</p></div>`;
}

function signin(clientId) {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>CBI Dashboard · Sign in</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;
 background:linear-gradient(168deg,#123A63 0%,#0B2545 42%,#071A33 100%);color:#fff;padding:20px}
.card{background:#fff;color:#0F1E2E;border-radius:14px;padding:38px 40px;width:min(430px,100%);
 box-shadow:0 20px 60px rgba(8,25,43,.35)}
.brand{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.brand b{font-size:20px;font-weight:800;letter-spacing:.01em;display:block;line-height:1}
.brand span{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.12em;
 text-transform:uppercase;color:#6B8199;display:block;margin-top:5px}
h1{font-size:17px;font-weight:700;margin-bottom:7px;letter-spacing:-.02em}
p{color:#6B8199;font-size:13px;line-height:1.65;margin-bottom:20px}
p b{color:#0F1E2E}
.who{background:#F7F9FB;border:1px solid #E1E8EF;border-radius:9px;padding:12px 14px;
 font-size:12.5px;color:#3D5266;line-height:1.8;margin-bottom:20px}
.who code{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#0B2545}
#err{display:none;background:#FDECEA;color:#C0392B;border-radius:9px;padding:12px 14px;
 font-size:12.5px;line-height:1.6;margin-bottom:16px}
</style></head><body>
<div class="card">
  <div class="brand"><div><b>CBI</b><span>Central Business Intelligence</span></div></div>
  <h1>Sign in to continue</h1>
  <p>This dashboard holds lead names, call recordings and revenue data, so it is not open.
  Sign in with your work Google account.</p>
  <div id="err"></div>
  <div id="btn"></div>
  <div class="who" style="margin-top:20px">
    <b>Who can get in</b><br>
    Anyone with an <code>@interviewkickstart.com</code> address<br>
    <code>theailabdaily@gmail.com</code><br>
    <code>mohitmundhara8@gmail.com</code>
  </div>
</div>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
window.onload = function () {
  if (!"${clientId}") {
    document.getElementById("err").style.display = "block";
    document.getElementById("err").textContent =
      "GOOGLE_CLIENT_ID is not set in Vercel, so there is nothing to sign in against.";
    return;
  }
  google.accounts.id.initialize({
    client_id: "${clientId}",
    callback: async function (resp) {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: resp.credential }),
      });
      const j = await r.json();
      if (j.ok) { location.reload(); return; }
      const e = document.getElementById("err");
      e.style.display = "block";
      e.textContent = j.error || "Sign-in failed.";
    },
  });
  google.accounts.id.renderButton(document.getElementById("btn"),
    { theme: "outline", size: "large", width: 350, text: "signin_with" });
  google.accounts.id.prompt();
};
</script></body></html>`;
}
