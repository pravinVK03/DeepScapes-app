export type FeedbackEmail = {
  id: string;
  userId: string;
  email?: string;
  category: string;
  rating?: number;
  message: string;
  page?: string;
  createdAt: string;
};

const recipient = process.env.FEEDBACK_TO_EMAIL?.trim() || "padmanathan.kdev@gmail.com";
const sender = process.env.FEEDBACK_FROM_EMAIL?.trim() || "DeepScapes Feedback <onboarding@resend.dev>";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

export async function sendFeedbackCopy(feedback: FeedbackEmail, origin: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "not_configured" as const };

  const category = feedback.category.slice(0, 1).toUpperCase() + feedback.category.slice(1);
  const rating = feedback.rating ? `${feedback.rating}/5` : "Not provided";
  const submittedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(feedback.createdAt));
  const pageUrl = feedback.page?.startsWith("/") ? new URL(feedback.page, origin).toString() : feedback.page;
  const text = [`New DeepScapes feedback`, ``, `Category: ${category}`, `Rating: ${rating}`, `Submitted by: ${feedback.email || "Unknown"}`, `User ID: ${feedback.userId}`, `Submitted: ${submittedAt}`, pageUrl ? `Page: ${pageUrl}` : "", ``, feedback.message].filter(Boolean).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#17231d;line-height:1.55"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#718077">DeepScapes feedback</p><h1 style="font-size:24px;margin:8px 0 24px">${escapeHtml(category)} feedback</h1><table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:4px 18px 4px 0;color:#718077">Rating</td><td>${escapeHtml(rating)}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#718077">Submitted by</td><td>${escapeHtml(feedback.email || "Unknown")}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#718077">User ID</td><td>${escapeHtml(feedback.userId)}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#718077">Submitted</td><td>${escapeHtml(submittedAt)}</td></tr>${pageUrl ? `<tr><td style="padding:4px 18px 4px 0;color:#718077">Page</td><td><a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></td></tr>` : ""}</table><div style="margin-top:24px;padding:18px;border:1px solid #e5e8e2;border-radius:12px;background:#f7f7f3;white-space:pre-wrap">${escapeHtml(feedback.message)}</div></div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `feedback/${feedback.id}` },
      body: JSON.stringify({ from: sender, to: [recipient], reply_to: feedback.email, subject: `[DeepScapes] ${category} feedback · ${rating}`, text, html, tags: [{ name: "category", value: feedback.category }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error("Feedback email failed", { status: response.status });
      return { sent: false, reason: "provider_error" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("Feedback email failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return { sent: false, reason: "provider_error" as const };
  }
}
