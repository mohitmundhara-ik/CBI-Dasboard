// api/whoami.js — who is signed in, for the header strip.
import crypto from "crypto";

export default async function handler(req, res) {
  const secret = process.env.AUTH_SECRET;
  const cookie = (req.headers.cookie || "").split(";").map(s => s.trim())
    .find(s => s.startsWith("cbi_session="));
  if (!secret || !cookie) return res.status(200).json({ signedIn: false });
  try {
    const [body, sig] = cookie.slice("cbi_session=".length).split(".");
    const expect = crypto.createHmac("sha256", secret).update(body).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (expect !== sig) return res.status(200).json({ signedIn: false });
    const c = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (c.exp < Date.now() / 1000) return res.status(200).json({ signedIn: false, expired: true });
    return res.status(200).json({
      signedIn: true, email: c.email, name: c.name, picture: c.picture,
      expiresAt: new Date(c.exp * 1000).toISOString(),
    });
  } catch { return res.status(200).json({ signedIn: false }); }
}
