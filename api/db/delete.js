// src/api/helper.ts
function sendResponse(res, statusCode, data) {
  try {
    if (res.headersSent) return;
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(statusCode).json(data);
    }
    res.statusCode = statusCode;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[sendResponse Error]:", err);
  }
}

// src/api/delete.ts
async function handler(req, res) {
  try {
    return sendResponse(res, 503, {
      success: false,
      offlineMode: true,
      message: "Remote deletion is temporarily disabled until server-side authentication and authorization are configured."
    });
  } catch {
    return sendResponse(res, 503, { success: false, message: "Remote deletion is disabled." });
  }
}
export {
  handler as default
};
