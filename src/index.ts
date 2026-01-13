import { createApp } from "./app";

const port = process.env.PORT || 3000;
const app = createApp();

console.log(`Starting Indie Blog Reader on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
