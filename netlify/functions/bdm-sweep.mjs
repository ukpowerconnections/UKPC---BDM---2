// UKPC BDM Agent — powered by PlanIt live planning data
// Queries PlanIt for St Albans planning applications
// Twice daily: 07:30 and 16:30 UK time

async function getPlanitApplications() {
  // St Albans, Hertfordshire: 51.7449, -0.3349
  // Query PlanIt for applications within 20km radius
  // PlanIt API: https://www.planit.org.uk/api/applics/json
  
  try {
    const url = new URL("https://www.planit.org.uk/api/applics/json");
    url.searchParams.append("latitude", "51.7449");
    url.searchParams.append("longitude", "-0.3349");
    url.searchParams.append("radius", "20"); // km
    url.searchParams.append("maxresults", "50");
    url.searchParams.append("sortby", "date_received");
    url.searchParams.append("sortorder", "descending");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "User-Agent": "UKPC-BDM-Agent/1.0" },
    });

    if (!res.ok) {
      throw new Error(`PlanIt API ${res.status}`);
    }

    const data = await res.json();
    return data.applications || [];
  } catch (err) {
    console.error("PlanIt fetch failed:", err.message);
    return [];
  }
}

function filterForHVRelevance(applications) {
  // Filter for 11kV-relevant schemes
  const keywords = [
    "data centre", "data center",
    "battery", "bess", "energy storage",
    "logistics", "warehouse", "distribution",
    "residential", "housing",
    "substation", "electrical",
    "industrial",
  ];

  return applications.filter((app) => {
    const text = `${app.name || ""} ${app.proposal || ""} ${app.address || ""}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}

async function runClaudeSweepWithPlanit(apiKey, applications) {
  // Format applications for Claude analysis
  const appList = applications
    .slice(0, 15) // Top 15 most recent
    .map(
      (app) =>
        `- **${app.name || "Unknown"}** (Ref: ${app.reference || "N/A"})
    Location: ${app.address || "Unknown"}
    Proposal: ${app.proposal || "Not specified"}
    Submitted: ${app.date_received || "Unknown"}
    Status: ${app.status || "Unknown"}
    Applicant: ${app.applicant_name || "Unknown"}`
    )
    .join("\n\n");

  const prompt = `You are the business development researcher for UK Power Connections Ltd (UKPC),
a NERS-accredited Independent Connection Provider based in St Albans, AL3 4PQ.

Below are LIVE planning applications from PlanIt, filtered for the St Albans area and 11kV-relevant schemes
(data centres, BESS, logistics, residential 100+, substations).

${appList || "No new applications found in the last 24 hours."}

TASK:
1. For each application, assess HV connection relevance:
   - Will it need 11kV/HV? (data centres >1MW, BESS >5MW, 100+ homes, logistics >10,000 sqm)
   - What's the likely connection voltage and scope?
   
2. Flag TIME-SENSITIVE items:
   - Applications with upcoming decision dates
   - Recent submissions that indicate early-stage pipeline

3. Suggested next action for each:
   - Who to contact (developer, architect, agent)
   - Why UKPC is relevant
   - When to approach (before detailed design, or at planning stage)

4. NERS HV SCOPE FLAG:
   UKPC's NERS accreditation currently covers LV only. Any lead requiring HV self-delivery (jointing, energisation, HV cable) 
   needs either a NERS HV scope extension OR a jointing partner. Flag this for every scheme.

Format as an actionable digest. Be concise — Ryan checks this twice daily. 
If nothing new or relevant, say so plainly.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
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
  const stamp = now.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: `UKPC BDM Agent <${from}>`,
      to: [to],
      subject: `11kV lead sweep — ${stamp} (PlanIt live data)`,
      text:
        body +
        "\n\n—\nLive planning data from PlanIt (planit.org.uk). Verify all reference numbers and deadlines on St Albans planning portal before bidding.",
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
    // Step 1: Fetch live applications from PlanIt
    console.log("Fetching live applications from PlanIt...");
    const allApps = await getPlanitApplications();
    console.log(`Found ${allApps.length} applications near St Albans`);

    // Step 2: Filter for HV relevance
    const hvRelevant = filterForHVRelevance(allApps);
    console.log(`${hvRelevant.length} are HV-relevant (data centre, BESS, logistics, residential, industrial)`);

    // Step 3: Send to Claude for analysis
    console.log("Sending to Claude for analysis...");
    const digest = await runClaudeSweepWithPlanit(ANTHROPIC_API_KEY, hvRelevant);

    // Step 4: Email the digest
    await sendDigest({ resendKey: RESEND_API_KEY, to: DIGEST_TO, from: DIGEST_FROM, body: digest });
    console.log("PlanIt sweep complete, digest emailed.");
    return new Response("OK");
  } catch (err) {
    console.error("Sweep failed:", err.message);
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
  schedule: "30 6,15 * * *",
};
