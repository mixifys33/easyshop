// Script to check which account/email is associated with your ImageKit API keys
const https = require("https");

const PRIVATE_KEY = "private_hhJj08yPDJ7mAZrO4QbySceUnCM=";

// ImageKit uses HTTP Basic Auth with private key as username and empty password
const auth = Buffer.from(`${PRIVATE_KEY}:`).toString("base64");

const options = {
  hostname: "api.imagekit.io",
  path: "/v1/profile",
  method: "GET",
  headers: {
    Authorization: `Basic ${auth}`,
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    try {
      const profile = JSON.parse(data);
      console.log("\n--- ImageKit Account Info ---");
      console.log("Email   :", profile.email || "N/A");
      console.log("Name    :", profile.name || "N/A");
      console.log("Plan    :", profile.plan || "N/A");
      console.log("Full response:", JSON.stringify(profile, null, 2));
    } catch {
      console.error("Failed to parse response:", data);
    }
  });
});

req.on("error", (e) => console.error("Request error:", e.message));
req.end();
