// Runs automatically every time Netlify receives a verified form submission.
// Sends a phone alert for each new quote request.
//
// Pushover (preferred): set PUSHOVER_TOKEN and PUSHOVER_USER in Netlify environment variables.
// ntfy (fallback):      set NTFY_TOPIC in Netlify environment variables.
// Secrets live only in Netlify settings, never in this public repository.

exports.handler = async (event) => {
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
  const digits = phone.replace(/\D/g, "").slice(-10);
  const tel = digits.length === 10 ? `tel:+1${digits}` : "";
  const first = name.split(" ")[0].replace(/[^A-Za-z0-9'-]/g, "") || "customer";

  const lines = [
    `${name}${phone ? " · " + phone : ""}`,
    [clean(d.type), d.count ? clean(d.count) + " units" : ""].filter(Boolean).join(" · "),
    [d.zip ? "ZIP " + clean(d.zip) : "", clean(d.when)].filter(Boolean).join(" · "),
    clean(d.own),
    clean(d.email),
  ].filter(Boolean);
  const title = "New quote request";
  const message = lines.join("\n");

  const sent = [];

  const { PUSHOVER_TOKEN, PUSHOVER_USER } = process.env;
  if (PUSHOVER_TOKEN && PUSHOVER_USER) {
    const form = new URLSearchParams({
      token: PUSHOVER_TOKEN,
      user: PUSHOVER_USER,
      title,
      message,
      priority: process.env.PUSHOVER_PRIORITY || "1",
      sound: process.env.PUSHOVER_SOUND || "cashregister",
    });
    if (form.get("priority") === "2") {
      form.set("retry", "60"); // repeat every 60 seconds
      form.set("expire", "900"); // for up to 15 minutes, until acknowledged
    }
    if (tel) {
      form.set("url", tel);
      form.set("url_title", `Call ${first}`);
    }
    try {
      const res = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", body: form });
      console.log("pushover status", res.status);
      if (res.ok) sent.push("pushover");
    } catch (err) {
      console.log("pushover failed:", err.message);
    }
  }

  const topic = process.env.NTFY_TOPIC;
  if (topic && sent.length === 0) {
    const headers = { Title: title, Priority: "high", Tags: "house" };
    if (tel) {
      headers.Click = tel;
      headers.Actions = `view, Call ${first}, ${tel}`;
    }
    try {
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: "POST", headers, body: message });
      console.log("ntfy status", res.status);
      if (res.ok) sent.push("ntfy");
    } catch (err) {
      console.log("ntfy failed:", err.message);
    }
  }

  if (sent.length === 0) console.log("No alert service configured or all failed.");
  return { statusCode: 200, body: sent.join(",") || "none" };
};
