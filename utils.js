function parseRequestBody(req) {
  try {
    if (typeof req.body === "object" && req.body !== null && !Buffer.isBuffer(req.body)) {
      return req.body;
    }

    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString());
    }

    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }

    throw new Error("Unsupported request body format");
  } catch (err) {
    console.error("Failed to parse request body:", err.message);
    return null;
  }
}

module.exports = {
  parseRequestBody: parseRequestBody,
};
