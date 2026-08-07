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
  <style>*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
  body{font-family:Inter,system-ui,sans-serif;
  background:linear-gradient(168deg,#123A63 0%,#0B2545 42%,#071A33 100%);
  display:flex;align-items:center;justify-content:center;padding:24px;
  min-height:100vh;min-height:100dvh}
  .c{background:#fff;color:#0F1E2E;border-radius:16px;padding:38px 40px;width:min(420px,100%);
  text-align:center;box-shadow:0 24px 70px rgba(8,25,43,.4)}
  h1{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px}
  p{color:#6B8199;font-size:13px;line-height:1.65}</style>
  <div class="c"><h1>${title}</h1><p>${msg}</p></div>`;
}

function signin(clientId) {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Central Business Intelligence (CBI) Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" href="data:image/png;base64,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">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:Inter,system-ui,sans-serif;
 background:linear-gradient(168deg,#123A63 0%,#0B2545 42%,#071A33 100%);
 background-attachment:fixed;color:#fff;
 display:flex;align-items:center;justify-content:center;padding:24px;
 min-height:100vh;min-height:100dvh}
body::before{content:'';position:fixed;inset:0;pointer-events:none;
 background:radial-gradient(760px 420px at 50% 0%, rgba(0,169,206,.16), transparent 66%)}
.card{position:relative;background:#fff;color:#0F1E2E;border-radius:16px;
 padding:44px 42px 38px;width:min(408px,100%);text-align:center;
 box-shadow:0 24px 70px rgba(8,25,43,.4)}
.logo{width:56px;height:56px;border-radius:13px;display:block;margin:0 auto 20px;
 box-shadow:0 3px 14px rgba(11,37,69,.18)}
h1{font-size:19px;font-weight:800;letter-spacing:-.025em;line-height:1.3;margin-bottom:6px}
.sub{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.16em;
 text-transform:uppercase;color:#8A9BAD;margin-bottom:28px}
#btn{display:flex;justify-content:center;min-height:44px}
#err{display:none;background:#FDECEA;color:#C0392B;border-radius:9px;padding:12px 14px;
 font-size:12.5px;line-height:1.6;margin-bottom:16px;text-align:left}
.foot{margin-top:26px;padding-top:18px;border-top:1px solid #EDF1F5;
 font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;
 text-transform:uppercase;color:#A8B6C4}
</style></head><body>
<div class="card">
  <img class="logo" src="data:image/png;base64,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" alt="Interview Kickstart">
  <h1>Central Business Intelligence<br>(CBI) Dashboard</h1>
  <div class="sub">Interview Kickstart</div>
  <div id="err"></div>
  <div id="btn"></div>
  <div class="foot">Authorised access only</div>
</div>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
window.onload = function () {
  var CID = "${clientId}";
  if (!CID) {
    var e0 = document.getElementById("err");
    e0.style.display = "block";
    e0.textContent = "GOOGLE_CLIENT_ID is not set in Vercel, so there is nothing to sign in against.";
    return;
  }
  google.accounts.id.initialize({
    client_id: CID,
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
    { theme: "outline", size: "large", width: 324, text: "signin_with", shape: "rectangular" });
  google.accounts.id.prompt();
};
</script></body></html>`;
}
