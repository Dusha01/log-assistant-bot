import dotenv from 'dotenv'

dotenv.config();
const env = process.env;

export const config = {
  // Bot settings
  
  cronSchedule: "0 */2 * * *",

  openAIKey: env.OPEN_AI_KEY,
  openAIBaseUrl: env.OPEN_AI_BASE_URL,
  openAIModel: env.OPEN_AI_MODEL,
};