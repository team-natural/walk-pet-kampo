// The one place an SMS leaves this app (F-01-02). **The provider is not chosen yet**
// (GOV-02 TBD-61): until it is, this logs what would have gone out, exactly as mail/client.ts
// does without a key — a local machine has no SMS credit and a developer still has to be able to
// verify a number.
//
// When TBD-61 lands, only the body of `deliver()` changes: every caller already goes through
// `sendSms()`, and the code itself never leaves the Service that made it.
import { env } from "cloudflare:workers";

export interface SmsMessage {
  /** E.164 or the national form the provider accepts; normalised by the caller. */
  to: string;
  text: string;
}

async function deliver(message: SmsMessage): Promise<void> {
  // TODO(TBD-61): call the chosen provider here. Keep it fetch-based so workerd needs no
  // nodejs_compat, and keep the 5–10s timeout DEV-05 §8 asks of synchronous third-party calls.
  console.log(JSON.stringify({ event: "sms.skipped", reason: "SMS provider is not configured (GOV-02 TBD-61)", to: message.to }));
}

export async function sendSms(message: SmsMessage): Promise<void> {
  if (!env.SMS_API_KEY) {
    console.log(JSON.stringify({ event: "sms.skipped", reason: "SMS_API_KEY is not configured", to: message.to }));
    return;
  }

  await deliver(message);
}
