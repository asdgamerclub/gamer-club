// A.S.D. Gamer Club - Google Wallet loyalty pass (prima emissione di test)
// Il JSON dell'account Google va SOLO nei secrets Supabase.
// Questa funzione non deve essere usata con un JWT utente anonimo.
// Il link di salvataggio è personale: non pubblicarlo in pagine accessibili a tutti.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

const ISSUER_ID = "3388000000023248412";
const BASE = "https://asdgamerclub.github.io/gamer-club";
const GOOGLE_CLASS_ID = `${ISSUER_ID}.gamer_club_fidelity_v1`;
const ORIGIN = "https://asdgamerclub.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const response = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
function toBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
const encode = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
async function signJwt(claims: object, credentials: { client_email: string; private_key: string }) {
  const pem = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(pem);
  const data = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", data, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return response(405, { error: "Metodo non consentito" });
  // Non riflettere mai un Origin estraneo: accesso soltanto da interfaccia ufficiale.
  const origin = request.headers.get("Origin");
  if (origin && origin !== ORIGIN) return response(403, { error: "Origine non consentita" });
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const userJwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!userJwt) return response(401, { error: "Accesso operatore richiesto" });
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !anonKey) return response(500, { error: "Configurazione Supabase incompleta" });
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await client.auth.getUser(userJwt);
    if (userError || !userResult.user) return response(401, { error: "Sessione non valida" });
    const { data: operator, error: operatorError } = await client.rpc("gc_is_operator");
    if (operatorError || operator !== true) return response(403, { error: "Solo operatori autorizzati" });

    const body = await request.json().catch(() => ({}));
    const token = typeof body.qr_token === "string" ? body.qr_token.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
      return response(400, { error: "QR socio non valido" });
    const { data, error } = await client.rpc("gc_member_by_qr", { p_token: token });
    if (error || !Array.isArray(data) || !data.length) return response(404, { error: "Socio non trovato" });
    const member = data[0];
    if (member.status !== "active") return response(409, { error: "La tessera deve essere attiva" });

    const secret = Deno.env.get("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON");
    if (!secret) return response(500, { error: "Secret Google Wallet non configurato" });
    let credentials: { client_email: string; private_key: string };
    try { credentials = JSON.parse(secret); } catch { return response(500, { error: "Il secret Google non contiene JSON valido" }); }
    if (!credentials?.client_email || !credentials?.private_key)
      return response(500, { error: "Il secret Google non è un account di servizio completo" });

    const number = String(member.member_number).padStart(6, "0");
    const name = `${member.first_name} ${member.last_name}`.trim();
    // ID stabile per socio. I dati personali e il QR vengono gestiti da Supabase.
    const objectId = `${ISSUER_ID}.socio_${String(member.member_id).replace(/-/g, "")}`;
    const { data: tier } = await client.rpc("gc_card_tier", { p_member: member.member_id });
    const tierName = tier === "gold" ? "Oro" : tier === "silver" ? "Argento" : "Blu";
    const logo = `${BASE}/LOGO%20PER%20INSTAGRAM.jpg`;
    const loyaltyClass = {
      id: GOOGLE_CLASS_ID,
      issuerName: "A.S.D. Gamer Club",
      programName: "Gamer Club Card",
      reviewStatus: "UNDER_REVIEW",
      programLogo: {
        sourceUri: { uri: logo },
        contentDescription: { defaultValue: { language: "it-IT", value: "Logo A.S.D. Gamer Club" } },
      },
      hexBackgroundColor: "#091a36",
    };
    const loyaltyObject = {
      id: objectId,
      classId: GOOGLE_CLASS_ID,
      state: "ACTIVE",
      accountId: number,
      accountName: name,
      barcode: { type: "QR_CODE", value: token, alternateText: `Socio ${number}` },
      loyaltyPoints: { label: "Partite", balance: { string: `${member.progress}/10` } },
      textModulesData: [
        { id: "tier", header: "Livello tessera", body: tierName },
        { id: "premi", header: "Premi disponibili", body: String(member.rewards_available) },
        { id: "riscattati", header: "Premi riscattati", body: String(member.rewards_redeemed) },
        { id: "regola", header: "Premio fedeltà", body: "Ogni 10 partite pagate, 1 partita gratuita per 2 giocatori." },
      ],
    };
    const now = Math.floor(Date.now() / 1000);
    const jwt = await signJwt({
      iss: credentials.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      origins: [ORIGIN],
      payload: { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] },
    }, credentials);
    return response(200, {
      saveUrl: `https://pay.google.com/gp/v/save/${jwt}`,
      memberNumber: number,
      tier: tierName,
      warning: "Tessera di test: emissione pubblica solo dopo l'approvazione Google.",
    });
  } catch (_error) {
    // Non includere mai stack trace, segreti o dettagli personali negli errori HTTP.
    return response(500, { error: "Impossibile creare la tessera. Controlla i log della Edge Function." });
  }
});
