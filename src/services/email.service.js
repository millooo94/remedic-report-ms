import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

const REMEDIC_BLUE = "#1C9EBD";
const REMEDIC_GREEN = "#AECA20";

function formatItalianDate(value) {
  if (!value) {
    return "Non indicata";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Non indicata";
  }

  return date.toLocaleDateString("it-IT");
}

function formatItalianDateTime(value) {
  if (!value) {
    return "Non indicata";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Non indicata";
  }

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildReservedLoginUrl() {
  const baseUrl = String(env.appPublicUrl || "").trim();
  if (!baseUrl) {
    return "";
  }

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}view=reserved-login`;
}

export async function sendPasswordResetEmail({
  email,
  displayName,
  resetUrl,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const greeting = `Ciao ${displayName || ""},`.trim();
  const title = "Reimpostazione password";
  const intro =
    "Hai richiesto la reimpostazione della password per l'Area Riservata Remedic.";
  const text = [
    greeting,
    "",
    intro,
    `Apri questo link entro 30 minuti: ${resetUrl}`,
    "",
    "Se non hai richiesto tu il reset, ignora questa email.",
  ].join("\n");

  const sent = await safeSendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Reimpostazione password Area Riservata Remedic",
    text,
    html: buildBrandedEmailHtml({
      eyebrow: "Area riservata",
      title,
      intro,
      lines: [
        "Per motivi di sicurezza il link scade dopo 30 minuti.",
        "Se non hai richiesto tu il reset, puoi ignorare questa email.",
      ],
      ctaLabel: "Reimposta password",
      ctaUrl: resetUrl,
    }),
  });

  return sent;
}

export async function sendDraftAssignedEmail({
  email,
  displayName,
  reportType,
  patientName,
  referenceDate,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const typeLabel = reportType === "psg" ? "PSG" : "EMG";
  const subject = `Nuovo referto ${typeLabel} da completare - Remedic`;
  const greeting = `Gentile ${displayName || "collega"},`;
  const intro = "E stato caricato un nuovo referto nella tua Area Refertatore.";
  const lines = [
    `Tipo referto: ${typeLabel}`,
    `Paziente: ${patientName || "Non indicato"}`,
    `Data esame/registrazione: ${formatItalianDate(referenceDate)}`,
    "Accedi all'Area Riservata per completare la refertazione.",
  ];
  const reservedLoginUrl = buildReservedLoginUrl() || env.appPublicUrl;

  const sent = await safeSendMail({
    from: env.smtpFrom,
    to: email,
    subject,
    text: [greeting, "", intro, ...lines, "", `Accedi qui: ${reservedLoginUrl}`].join(
      "\n",
    ),
    html: buildBrandedEmailHtml({
      eyebrow: "Nuovo referto assegnato",
      title: `Nuovo referto ${typeLabel} da completare`,
      intro,
      greeting,
      lines,
      ctaLabel: "Accedi all'Area Riservata",
      ctaUrl: reservedLoginUrl,
    }),
  });

  return sent;
}

export async function sendSignedPdfNotificationEmail({
  reportType,
  patientName,
  refertatoreName,
  driveLink,
  completedAt,
}) {
  if (!(await canSendEmail()) || !env.signedPdfNotificationEmail) {
    return { sent: false, reason: "smtp_or_notification_not_configured" };
  }

  const typeLabel = reportType === "psg" ? "PSG" : "EMG";
  const subject = `Referto firmato caricato - ${typeLabel} - Remedic`;
  const intro =
    "Il PDF firmato definitivo e stato acquisito correttamente ed e disponibile per la gestione amministrativa.";
  const lines = [
    `Tipo referto: ${typeLabel}`,
    `Paziente: ${patientName || "Non indicato"}`,
    `Refertatore: ${refertatoreName || "Non indicato"}`,
    `Data: ${formatItalianDate(completedAt || new Date().toISOString())}`,
    `Stato Drive: ${driveLink ? "Salvato su Drive" : "In attesa di archiviazione amministrativa"}`,
  ];
  const reservedLoginUrl = buildReservedLoginUrl() || env.appPublicUrl;

  const sent = await safeSendMail({
    from: env.smtpFrom,
    to: env.signedPdfNotificationEmail,
    subject,
    text: [
      "Notifica automatica Remedic",
      "",
      intro,
      ...lines,
      driveLink ? `Link Drive: ${driveLink}` : `Accedi qui: ${reservedLoginUrl}`,
    ].join("\n"),
    html: buildBrandedEmailHtml({
      eyebrow: "Archivio definitivo",
      title: `PDF firmato ${typeLabel} caricato`,
      intro,
      lines,
      ctaLabel: driveLink ? "Apri archivio" : "Accedi all'Area Riservata",
      ctaUrl: driveLink || reservedLoginUrl,
    }),
  });

  return sent;
}

export async function sendSignedReportToPatient({
  to,
  subject,
  body,
  attachmentPath,
  attachmentFileName,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const sent = await safeSendMail({
    from: env.smtpFrom,
    to,
    subject,
    text: body,
    html: buildBrandedEmailHtml({
      eyebrow: "Invio referto",
      title: subject,
      intro: body,
      lines: [
        "In allegato trovi il referto firmato relativo alla prestazione eseguita presso Remedic.",
      ],
      ctaLabel: null,
      ctaUrl: null,
    }),
    attachments: [
      {
        filename: attachmentFileName,
        path: attachmentPath,
        contentType: "application/pdf",
      },
    ],
  });

  return sent;
}

export async function sendTwoFactorEnabledEmail({
  email,
  displayName,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const intro =
    "L'autenticazione a due fattori e stata attivata correttamente per il tuo account Remedic.";

  return safeSendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Autenticazione a due fattori attivata - Remedic",
    text: [
      `Gentile ${displayName || "utente"},`,
      "",
      intro,
      "Se non riconosci questa operazione, contatta subito l'assistenza Remedic.",
    ].join("\n"),
    html: buildBrandedEmailHtml({
      eyebrow: "Sicurezza account",
      title: "Autenticazione a due fattori attivata",
      greeting: `Gentile ${displayName || "utente"},`,
      intro,
      lines: [
        "Da questo momento per accedere all'Area Riservata sara richiesto anche il codice generato dalla tua app Authenticator.",
        "Se non riconosci questa operazione, contatta subito l'assistenza Remedic.",
        `Data: ${formatItalianDateTime(new Date().toISOString())}`,
      ],
    }),
  });
}

export async function sendRecoveryCodeUsedEmail({
  email,
  displayName,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const intro =
    "E stato utilizzato un codice di recupero per accedere alla tua Area Riservata Remedic.";

  return safeSendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Codice di recupero 2FA utilizzato - Remedic",
    text: [
      `Gentile ${displayName || "utente"},`,
      "",
      intro,
      "Se non sei stato tu, cambia subito la password e contatta l'assistenza Remedic.",
    ].join("\n"),
    html: buildBrandedEmailHtml({
      eyebrow: "Sicurezza account",
      title: "Codice di recupero utilizzato",
      greeting: `Gentile ${displayName || "utente"},`,
      intro,
      lines: [
        "Se non sei stato tu, cambia subito la password e contatta l'assistenza Remedic.",
        `Data: ${formatItalianDateTime(new Date().toISOString())}`,
      ],
    }),
  });
}

export async function sendPasswordChangedSecurityEmail({
  email,
  displayName,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const intro =
    "La password del tuo account Remedic e stata aggiornata correttamente.";

  return safeSendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Password aggiornata - Remedic",
    text: [
      `Gentile ${displayName || "utente"},`,
      "",
      intro,
      "Se non riconosci questa operazione, contatta subito l'assistenza Remedic.",
    ].join("\n"),
    html: buildBrandedEmailHtml({
      eyebrow: "Sicurezza account",
      title: "Password aggiornata",
      greeting: `Gentile ${displayName || "utente"},`,
      intro,
      lines: [
        "Se non riconosci questa operazione, contatta subito l'assistenza Remedic.",
        `Data: ${formatItalianDateTime(new Date().toISOString())}`,
      ],
    }),
  });
}

function buildBrandedEmailHtml({
  eyebrow,
  title,
  intro,
  greeting = "",
  lines = [],
  ctaLabel = null,
  ctaUrl = null,
}) {
  const safeLines = lines
    .filter(Boolean)
    .map(
      (line) =>
        `<li style="margin:0 0 8px;color:#475569;font-size:15px;line-height:1.6;">${escapeHtml(line)}</li>`,
    )
    .join("");

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `
        <div style="margin-top:28px;">
          <a
            href="${escapeHtml(ctaUrl)}"
            style="display:inline-block;padding:14px 22px;border-radius:999px;background:${REMEDIC_BLUE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;"
          >
            ${escapeHtml(ctaLabel)}
          </a>
        </div>
      `
      : "";

  return `
    <div style="margin:0;padding:32px 16px;background:#eef7fa;font-family:Arial,'Open Sans',sans-serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 54px rgba(15,23,42,0.12);">
        <div style="padding:24px 28px;background:linear-gradient(135deg, ${REMEDIC_BLUE} 0%, ${REMEDIC_GREEN} 100%);color:#ffffff;">
          <div style="font-size:30px;font-weight:800;letter-spacing:0.02em;">Remedic</div>
          <div style="margin-top:6px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.92;">
            Centro Medico Polispecialistico
          </div>
        </div>
        <div style="padding:30px 28px 32px;">
          ${
            eyebrow
              ? `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(28,158,189,0.12);color:${REMEDIC_BLUE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>`
              : ""
          }
          <h1 style="margin:16px 0 12px;font-size:28px;line-height:1.2;color:#0f172a;">${escapeHtml(title)}</h1>
          ${
            greeting
              ? `<p style="margin:0 0 14px;color:#0f172a;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>`
              : ""
          }
          <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
          ${
            safeLines
              ? `<ul style="margin:20px 0 0;padding-left:20px;">${safeLines}</ul>`
              : ""
          }
          ${ctaHtml}
        </div>
        <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
          Questa e una comunicazione automatica Remedic. Per supporto operativo fai riferimento all'Area Riservata.
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function canSendEmail() {
  if (!env.smtpHost || !env.smtpFrom) {
    return false;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth:
        env.smtpUser && env.smtpPass
          ? {
              user: env.smtpUser,
              pass: env.smtpPass,
            }
          : undefined,
    });
  }

  return true;
}

async function safeSendMail(payload) {
  try {
    await transporter.sendMail(payload);
    return { sent: true };
  } catch (error) {
    console.error("Email send error:", error?.message || error);
    return { sent: false, reason: "smtp_send_failed" };
  }
}
