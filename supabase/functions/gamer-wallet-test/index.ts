// A.S.D. Gamer Club - Google Wallet loyalty pass (prima emissione di test)
// Il JSON dell'account Google va SOLO nei secrets Supabase.
// Questa funzione non deve essere usata con un JWT utente anonimo.
// Il link di salvataggio è personale: non pubblicarlo in pagine accessibili a tutti.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

const ISSUER_ID = "3388000000023248412";
const BASE = "https://asdgamerclub.github.io/gamer-club";
// Classi distinte per il design di primo rilascio; pass già salvati richiedono successiva sincronizzazione REST.
const classForTier = (tier: string) => `${ISSUER_ID}.gamer_club_${tier}_v2`;
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
    const objectId = `${ISSUER_ID}.socio_v2_${String(member.member_id).replace(/-/g, "")}`;
    const { data: tier } = await client.rpc("gc_card_tier", { p_member: member.member_id });
    const validTier = tier === "gold" ? "gold" : tier === "silver" ? "silver" : "blue";
    const tierName = { blue: "Blu", silver: "Argento", gold: "Oro" }[validTier];
    const classId = classForTier(validTier);
    const colors = { blue: "#0B2447", silver: "#3B4859", gold: "#4F3918" };
    const logo = `${BASE}/LOGO%20PER%20INSTAGRAM.jpg`;
    const loyaltyClass = {
      id: classId,
      issuerName: "A.S.D. Gamer Club",
      programName: `Gamer Club Card · ${tierName}`,
      accountNameLabel: "Socio",
      accountIdLabel: "Numero socio",
      rewardsTierLabel: "Livello",
      rewardsTier: tierName,
      reviewStatus: "UNDER_REVIEW",
      programLogo: {
        sourceUri: { uri: logo },
        contentDescription: { defaultValue: { language: "it-IT", value: "Logo A.S.D. Gamer Club" } },
      },
      hexBackgroundColor: colors[validTier],
      heroImage: {
        sourceUri: { uri: `${BASE}/assets/wallet-hero-${validTier}.png` },
        contentDescription: {
          defaultValue: { language: "it-IT", value: `Gamer Club Card, versione ${tierName}` }
        }
      },
      linksModuleData: { uris: [
        { uri: BASE + "/tessera.html", description: "La mia tessera online", id: "tessera_online" },
        { uri: BASE + "/", description: "Sito A.S.D. Gamer Club", id: "sito" }
      ] },
    };
    const loyaltyObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      accountId: number,
      accountName: name,
      barcode: { type: "QR_CODE", value: token, alternateText: `Socio ${number}` },
      loyaltyPoints: { label: "Partite del ciclo", balance: { string: `${member.progress}/10` } },
      secondaryLoyaltyPoints: { label: "Premi disponibili", balance: { int: member.rewards_available } },
      textModulesData: [
        { id: "tier", header: "Livello tessera", body: tierName },
        { id: "premi", header: "Premi disponibili", body: String(member.rewards_available) },
        { id: "riscattati", header: "Premi riscattati", body: String(member.rewards_redeemed) },
        { id: "regola", header: "Regolamento Fidelity", body: "Ogni 10 partite pagate, 1 partita gratuita per 2 giocatori. I premi sono cumulabili." },
        { id: "mancanti", header: "Per il prossimo premio", body: member.progress === 0 ? "10 partite" : `${10 - member.progress} partite` },
        { id: "stato", header: "Stato tessera", body: "Socio attivo" },
        { id: "indirizzo", header: "Dove siamo", body: "Via Erik Mutarelli 2, 4, 6 · Benevento" },
        { id: "contatti", header: "Contatti", body: "asdgamerclub@gmail.com" },
        { id: "motto", header: "Il nostro motto", body: "Entra nel gioco" },
      ],
    };
    // Aggiorna i dati dei pass gia' salvati quando un operatore registra una partita.
    // La grafica di sfondo resta quella della classe utilizzata al primo salvataggio.
    if (body.mode === "sync") {
      const nowToken = Math.floor(Date.now() / 1000);
      const assertion = await signJwt({
        iss: credentials.client_email,
        scope: "https://www.googleapis.com/auth/wallet_object.issuer",
        aud: "https://oauth2.googleapis.com/token",
        iat: nowToken,
        exp: nowToken + 300,
      }, credentials);
      const exchange = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      });
      if (!exchange.ok) return response(502, { error: "Autorizzazione Google Wallet non riuscita" });
      const access = await exchange.json();
      const update = {
        loyaltyPoints: loyaltyObject.loyaltyPoints,
        secondaryLoyaltyPoints: loyaltyObject.secondaryLoyaltyPoints,
        textModulesData: loyaltyObject.textModulesData,
        state: "ACTIVE",
      };
      const synced = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (synced.status === 404) return response(200, { synced: false, reason: "not_yet_saved" });
      if (!synced.ok) return response(502, { synced: false, error: "Google non ha accettato l'aggiornamento della tessera" });
      return response(200, { synced: true, memberNumber: number, tier: tierName });
    }
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
