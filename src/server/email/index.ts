import "server-only";

/**
 * Email provider abstraction. A real service (Resend/SES/…) plugs in later
 * behind this interface; local development logs to the server console so
 * flows like password reset are fully testable without any external
 * service or credentials.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

const consoleProvider: EmailProvider = {
  async send(message) {
    // Development-only delivery: print to the server terminal.
    console.log(
      [
        "",
        "─".repeat(60),
        `[email → ${message.to}] ${message.subject}`,
        "─".repeat(60),
        message.text,
        "─".repeat(60),
        "",
      ].join("\n"),
    );
  },
};

export function getEmailProvider(): EmailProvider {
  // Later: switch on an EMAIL_PROVIDER env var.
  return consoleProvider;
}
