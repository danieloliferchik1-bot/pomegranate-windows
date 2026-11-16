// Runs automatically every time Netlify receives a verified form submission.
// Sends a phone push notification for new quote requests through ntfy (https://ntfy.sh).
// The private channel name lives in the NTFY_TOPIC environment variable in Netlify,
// never in this public repository.

exports.handler = async (event) => {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log("NTFY_TOPIC is not set; skipping notification.");
    return { statusCode: 200, body: "skipped" };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}").payload || {};
  } catch (err) {
    console.log("Could not read submission:", err.message);
    return { statusCode: 200, body: "bad payload" };
  }
  if (payload.form_name && payload.form_name !== "quote") {
    return { statusCode: 200, body: "not a quote" };
  }

  const d = payload.data || {};
  const clean = (v) => String(v || "").replace(/[\r\n]+/g, " ").trim();
  const name = clean(d.name) || "Someone";
  const phone = clean(d.phone);
  const digits = phone.replace(/\D/g, "");

  const lines = [
    `${name}${phone ? " · " + phone : ""}`,
    [clean(d.type), d.count ? clean(d.count) + " units" : ""].filter(Boolean).join(" · "),
    [d.zip ? "ZIP " + clean(d.zip) : "", clean(d.when)].filter(Boolean).join(" · "),
    clean(d.own),
    clean(d.email),
  ].filter(Boolean);

  const headers = {
    Title: "New quote request",
    Priority: "high",
    Tags: "house",
  };
  if (digits.length >= 10) {
    headers.Click = `tel:+1${digits.slice(-10)}`;
    const first = name.split(" ")[0].replace(/[^A-Za-z0-9'-]/g, "") || "customer";
    headers.Actions = `view, Call ${first}, tel:+1${digits.slice(-10)}`;
  }

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: lines.join("\n"),
    });
    console.log("ntfy status", res.status);
  } catch (err) {
    console.log("ntfy failed:", err.message);
  }
  return { statusCode: 200, body: "ok" };
};
