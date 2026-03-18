const https = require("https");

const BUFFER_GQL_URL = "https://api.buffer.com";

function bufferGraphQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const token = process.env.BUFFER_API_KEY;
    if (!token) return reject(new Error("BUFFER_API_KEY not configured"));

    const payload = JSON.stringify({ query, variables });
    const options = {
      hostname: "api.buffer.com",
      path: "/",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            return reject(new Error(`Buffer API HTTP ${res.statusCode}: ${data}`));
          }
          if (parsed.errors && parsed.errors.length > 0) {
            return reject(new Error(`Buffer GraphQL error: ${parsed.errors[0].message}`));
          }
          resolve(parsed.data);
        } catch {
          reject(new Error(`Buffer API parse error (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getBufferChannels() {
  const query = `
    query GetChannels {
      account {
        organizations {
          id
          channels {
            id
            name
            service
            type
          }
        }
      }
    }
  `;
  const data = await bufferGraphQL(query);
  const channels = [];
  for (const org of (data.account?.organizations || [])) {
    for (const ch of (org.channels || [])) {
      channels.push({
        id: ch.id,
        name: ch.name,
        service: ch.service,
        type: ch.type,
      });
    }
  }
  return channels;
}

async function createBufferPost({ channelId, text, mode = "queue", dueAt = null, imageUrl = null }) {
  // mode: "shareNow" | "customSchedule" | "queue" | "shareNext"
  let assetsInput = "";
  if (imageUrl) {
    assetsInput = `, assets: { images: [{ url: "${imageUrl.replace(/"/g, '\\"')}" }] }`;
  }

  let scheduleInput = "";
  if (mode === "customSchedule" && dueAt) {
    scheduleInput = `, dueAt: "${dueAt}"`;
  }

  const query = `
    mutation CreatePost {
      createPost(input: {
        text: ${JSON.stringify(text)},
        channelId: "${channelId}",
        schedulingType: automatic,
        mode: ${mode}${scheduleInput}${assetsInput}
      }) {
        ... on PostActionSuccess {
          post {
            id
            text
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const data = await bufferGraphQL(query);
  const result = data.createPost;

  if (result.message) {
    throw new Error(`Buffer createPost failed: ${result.message}`);
  }

  return {
    id: result.post?.id,
    text: result.post?.text,
  };
}

module.exports = { bufferGraphQL, getBufferChannels, createBufferPost };
