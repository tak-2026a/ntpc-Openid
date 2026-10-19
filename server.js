"use strict";

const app = require("./api/index");

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`NTPC OpenID demo listening on http://localhost:${port}`);
});
