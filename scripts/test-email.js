import "dotenv/config";
import { initEmailAPI } from "../src/emailAPI.js";

// Utility per testare l'invio della mail di ringraziamento adozioni senza passare
// da /genera (che pubblica per davvero su Instagram/Facebook).
// Uso: node scripts/test-email.js <email> [sponsorName] [childName]

async function main() {
  const [email, sponsorName, childName] = process.argv.slice(2);
  if (!email) {
    console.error("Uso: node scripts/test-email.js <email> [sponsorName] [childName]");
    process.exit(1);
  }

  const emailAPI = await initEmailAPI();
  if (!emailAPI) {
    console.error("Email API non configurata (controlla EMAIL_USER/EMAIL_APP_PASSWORD in .env)");
    process.exit(1);
  }

  const result = await emailAPI.sendAdoptionThankYou(email, sponsorName, childName);
  console.log(result);
  process.exit(result.success ? 0 : 1);
}

main();
