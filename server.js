"use strict";

// Vercel detects this Express import as the production entrypoint.
const express = require("express");
const app = require("./api/index");

if (typeof express !== "function") {
  throw new Error("Express failed to load");
}

module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`NTPC OpenID demo listening on http://localhost:${port}`);
  });
}
