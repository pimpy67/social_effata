import "dotenv/config";
import nodemailer from "nodemailer";

// Utility generica per mandare una singola mail di testo semplice (es. un
// modello da tenere come riferimento), senza passare dai template fissi di
// emailAPI.js. Usa le stesse credenziali EMAIL_USER/EMAIL_APP_PASSWORD.
// Uso: node scripts/send-once.js <to> <subject> <bodyFile>

async function main() {
  const [to, subject, bodyFile] = process.argv.slice(2);
  if (!to || !subject || !bodyFile) {
    console.error("Uso: node scripts/send-once.js <to> <subject> <bodyFile>");
    process.exit(1);
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error("Mancano EMAIL_USER/EMAIL_APP_PASSWORD in .env");
    process.exit(1);
  }

  const fs = await import("fs");
  const text = fs.readFileSync(bodyFile, "utf-8");

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const info = await transporter.sendMail({ from: `"Effatà Italia ODV" <${user}>`, to, subject, text });
  console.log("Inviata:", info.messageId);
}

main();
