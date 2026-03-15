const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaude(systemPrompt, userMessage, options = {}) {
  const client = new Anthropic();
  const maxRetries = options.maxRetries || 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: options.maxTokens || 8192,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });
      return response.content[0].text;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const wait = err.status === 429 ? 30000 : 5000;
      console.log(`  API error (${err.status || err.message}), retrying in ${wait / 1000}s... (${attempt}/${maxRetries})`);
      await delay(wait);
    }
  }
}

function delayBetweenCalls(ms = 5000) {
  return delay(ms);
}

module.exports = { callClaude, delayBetweenCalls };
