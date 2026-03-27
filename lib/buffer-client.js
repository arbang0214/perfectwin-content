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

// Upload a local image file to Buffer via presigned S3 URL
// Returns a public URI usable in createPost assets
async function uploadImageToBuffer(channelId, fileBuffer, mimeType) {
  // Step 1: get presigned upload URL
  const intentQuery = `
    mutation CreateUploadIntent($channelId: String!, $fileType: String!, $fileSize: Int!) {
      createMediaUploadIntent(input: {
        channelId: $channelId
        fileType: $fileType
        fileSize: $fileSize
      }) {
        ... on MediaUploadIntentSuccess {
          presignedUrl
          uri
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const intentData = await bufferGraphQL(intentQuery, {
    channelId,
    fileType: mimeType,
    fileSize: fileBuffer.length,
  });

  const intentResult = intentData.createMediaUploadIntent;
  if (!intentResult) throw new Error("Buffer media upload: empty response");
  if (intentResult.message) throw new Error(`Buffer media upload intent failed: ${intentResult.message}`);

  const { presignedUrl, uri } = intentResult;

  // Step 2: PUT file binary to presigned S3 URL
  await uploadToUrl(presignedUrl, fileBuffer, mimeType);

  return uri;
}

function uploadToUrl(targetUrl, fileBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Presigned upload failed: HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
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
            serviceId
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
    serviceId: result.post?.serviceId || null,
  };
}

// Post a comment on a LinkedIn post via LinkedIn API
// postUrn: LinkedIn post URN, e.g. "urn:li:ugcPost:7123456789" or "urn:li:share:7123456789"
// actorUrn: LinkedIn org URN, e.g. "urn:li:organization:12345678"
async function postLinkedInComment(postUrn, actorUrn, commentText) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not configured");

  const encodedUrn = encodeURIComponent(postUrn);
  const payload = JSON.stringify({
    actor: actorUrn,
    message: { text: commentText },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.linkedin.com",
      path: `/v2/socialActions/${encodedUrn}/comments`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "X-Restli-Protocol-Version": "2.0.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          reject(new Error(`LinkedIn comment API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { bufferGraphQL, getBufferChannels, createBufferPost, uploadImageToBuffer, postLinkedInComment };
