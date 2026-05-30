import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

export async function sendPasswordResetEmail({
  email,
  displayName,
  resetUrl,
}) {
  if (!(await canSendEmail())) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to: email,
    subject: "Reimpostazione password Area Riservata Remedic",
    text: [
      `Ciao ${displayName || ""},`.trim(),
      "",
      "Hai richiesto la reimpostazione della password per l'Area Riservata Remedic.",
      `Apri questo link entro 30 minuti: ${resetUrl}`,
      "",
      "Se non hai richiesto tu il reset, ignora questa email.",
    ].join("\n"),
  });

  return { sent: true };
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
  await transporter.sendMail({
    from: env.smtpFrom,
    to: email,
    subject: `Nuovo referto ${typeLabel} da completare - ${patientName || "Paziente"}`,
    text: [
      `Ciao ${displayName || ""},`.trim(),
      "",
      `E disponibile un nuovo referto ${typeLabel} da completare.`,
      `Paziente: ${patientName || "Non indicato"}`,
      `Data esame/registrazione: ${referenceDate || "Non indicata"}`,
      `Accedi all'Area Riservata: ${env.appPublicUrl}`,
      "",
      "Il referto e pronto per la refertazione.",
    ].join("\n"),
  });

  return { sent: true };
}

export async function sendSignedPdfNotificationEmail({
  reportType,
  patientName,
  refertatoreName,
  driveLink,
}) {
  if (!(await canSendEmail()) || !env.signedPdfNotificationEmail) {
    return { sent: false, reason: "smtp_or_notification_not_configured" };
  }

  const typeLabel = reportType === "psg" ? "PSG" : "EMG";
  await transporter.sendMail({
    from: env.smtpFrom,
    to: env.signedPdfNotificationEmail,
    subject: `Referto firmato caricato - ${typeLabel} - ${patientName || "Paziente"}`,
    text: [
      `Tipo referto: ${typeLabel}`,
      `Paziente: ${patientName || "Non indicato"}`,
      `Refertatore: ${refertatoreName || "Non indicato"}`,
      `Data: ${new Date().toLocaleString("it-IT")}`,
      "Salvataggio Drive: completato",
      driveLink ? `Link Drive: ${driveLink}` : "Link Drive: non disponibile",
    ].join("\n"),
  });

  return { sent: true };
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

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text: body,
    attachments: [
      {
        filename: attachmentFileName,
        path: attachmentPath,
        contentType: "application/pdf",
      },
    ],
  });

  return { sent: true };
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
