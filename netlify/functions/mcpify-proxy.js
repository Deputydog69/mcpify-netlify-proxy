const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { jsonrpc, method, params, id } = body;

    const serverId = "5c714c5b-0494-4a86-b782-d5fef27ac450";
    const sseUrl = `https://agent.mcpify.ai/sse?server=${serverId}`;

    const postUrl = await getPostEndpoint(sseUrl);
    const mcpifyResponse = await postToMcpify(postUrl, { jsonrpc, method, params, id });

    return {
      statusCode: 200,
      body: JSON.stringify(mcpifyResponse),
    };
  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

function getPostEndpoint(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      res.setEncoding("utf8");
      let buffer = "";

      res.on("data", (chunk) => {
        buffer += chunk;
        const match = buffer.match(/event: endpoint\\ndata: (.+)/);
        if (match) {
          const relative = match[1].trim();
          resolve("https://agent.mcpify.ai" + relative);
          req.destroy();
        }
      });

      res.on("error", reject);
      res.on("end", () => reject(new Error("No endpoint received from SSE")));
    });

    req.on("error", reject);
  });
}

function postToMcpify(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);

          if (!parsed.content || !Array.isArray(parsed.content) || !parsed.content[0]?.text) {
            console.error("Unexpected MCPify response:", parsed);
            reject(new Error("Unexpected format from MCPify"));
            return;
          }

          const extracted = JSON.parse(parsed.content[0].text);
          resolve(extracted);
        } catch (err) {
          console.error("Parsing error:", err);
          console.error("Raw response body:", body);
          reject(new Error("Invalid JSON from MCPify"));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
