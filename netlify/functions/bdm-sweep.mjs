// UKPC BDM sweep — scheduled Netlify function.
// Runs twice daily (see netlify.toml), asks Claude (with live web search)
// for fresh 11kV/HV leads near St Albans, and emails the digest via Resend.
//
// Required environment variables (set in Netlify → Site settings → Environment variables):
//   ANTHROPIC_API_KEY  — from console.anthropic.com (billing enabled)
//   RESEND_API_KEY     — from resend.com (free tier is fine)
//   DIGEST_TO          — your email address
//   DIGEST_FROM        — sender address (e.g. onboarding@resend.dev until you verify a domain)

const SWEEP_PROMPT = `You are the business development researcher for UK Power Connections Ltd (UKPC),
a NERS-accredited Independent Connection Provider (ICP) based in St Albans, AL3 4PQ.
UKPC designs and BUILDS LV and HV electrical connections and 11kV substations that are
ADOPTED by a DNO (UK Power Networks / Eastern Power Networks in this region) or an IDNO
(GTC/Last Mile, Eclipse Power Networks, Vattenfall IDNO, Energy Assets Networks).
UKPC does not adopt connections itself. Note: UKPC's NERS scope currently covers LV, so
flag any lead where HV self-delivery would need a scope extension or jointing partner.

TASK — search the live web NOW and report:
1. OPEN PUBLIC TENDERS relevant to 11kV/HV substation works, package/GRP substations,
   ring main units, HV cabling or contestable connections, within Hertfordshire,
   Bedfordshire, Buckinghamshire or the north London / M25 corridor. Check Contracts
   Finder (contractsfinder.service.gov.uk), Find a Tender (find-tender.service.gov.uk)
   and Supply Hertfordshire. Relevant CPV codes: 45315300, 45231400, 31200000, 71323100,
   09310000. For each live notice: title, buyer, value, DEADLINE, reference, link.
2. NEW PRIVATE PIPELINE: newly submitted or newly consented planning applications near
   St Albans needing new 11kV connections — data centres (esp. Maylands/Hemel Hempstead),
   BESS/solar, logistics (M1 J8 / M25 / A1(M)), 100+ home residential schemes, and any
   movement on Hemel Garden Communities, the Watford General rebuild, or the London
   Luton Airport expansion (DCO TR020001).
3. Flag anything TIME-SENSITIVE (deadline within 3 weeks) at the very top.

RULES: Only report items you actually found in live search results, with links.
If a search returns nothing new since yesterday, say so plainly — do not pad.
Never invent reference numbers, values or deadlines. Keep it under 600 words,
formatted as a plain-text email digest with clear sections.`;

async function runClaudeSweep(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: SWEEP_PROMPT }],
       
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Empty response from Claude.");
  return text;
}

async function sendDigest({ resendKey, to, from, body }) {
  const now = new Date();
  const stamp = now.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: `UKPC BDM Agent <${from}>`,
      to: [to],
      subject: `11kV lead sweep — ${stamp}`,
      text: body + "\n\n—\nAutomated digest. Verify every reference and deadline before bidding.",
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend ${res.status}: ${errBody.slice(0, 500)}`);
  }
}

export default async function handler() {
  const { ANTHROPIC_API_KEY, RESEND_API_KEY, DIGEST_TO, DIGEST_FROM } = process.env;

  const missing = [
    !ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY",
    !RESEND_API_KEY && "RESEND_API_KEY",
    !DIGEST_TO && "DIGEST_TO",
    !DIGEST_FROM && "DIGEST_FROM",
  ].filter(Boolean);

  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    return new Response(`Missing env vars: ${missing.join(", ")}`, { status: 500 });
  }

  try {
    const digest = await runClaudeSweep(ANTHROPIC_API_KEY);
    await sendDigest({ resendKey: RESEND_API_KEY, to: DIGEST_TO, from: DIGEST_FROM, body: digest });
    console.log("Sweep complete, digest emailed.");
    return new Response("OK");
  } catch (err) {
    console.error("Sweep failed:", err.message);
    // Try to email the failure so it never fails silently.
    try {
      await sendDigest({
        resendKey: RESEND_API_KEY,
        to: DIGEST_TO,
        from: DIGEST_FROM,
        body: `The scheduled 11kV sweep failed this run.\n\nError: ${err.message}\n\nIt will retry at the next scheduled time.`,
      });
    } catch {}
    return new Response(`Failed: ${err.message}`, { status: 500 });
  }
}

export const config = {
  schedule: "23 1,15 * * *",
};
