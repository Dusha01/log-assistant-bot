import { config } from "./config.js";
import { createApp } from "../modules/api/app.js";

const app = createApp();
app.listen(config.apiPort, config.apiHost, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${config.apiHost}:${config.apiPort}`);
});

