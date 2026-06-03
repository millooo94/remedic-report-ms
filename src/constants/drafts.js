export const ALLOWED_REPORT_TYPES = ["standard", "emg", "psg"];

export const ALLOWED_DRAFT_STATUSES = [
  "bozza",
  "anamnesi_raccolta",
  "in_refertazione",
  "in_attesa_refertatore",
  "in_refertazione_refertatore",
  "pronto_per_firma",
  "firmato_caricato",
  "completato",
];

export const LEGACY_DRAFT_STATUS_MAP = {
  in_attesa_refertatore: "in_attesa_refertatore",
  in_refertazione_refertatore: "in_refertazione_refertatore",
};

export const ACCEPTED_DRAFT_STATUSES = [
  ...ALLOWED_DRAFT_STATUSES,
  ...Object.keys(LEGACY_DRAFT_STATUS_MAP),
];

export const EMG_ATTACHMENT_KINDS = {
  TRACE: "emg_tracciato",
  SIGNATURE: "emg_firma_tnfp",
  SIGNED_PDF: "emg_pdf_firmato",
};

export const PSG_ATTACHMENT_KINDS = {
  REPORT: "psg_report_strumentale",
  SIGNED_PDF: "psg_pdf_firmato",
};

export const STANDARD_ATTACHMENT_KINDS = {
  FILE: "standard_allegato",
};

export const ALLOWED_ATTACHMENT_KINDS = [
  ...Object.values(STANDARD_ATTACHMENT_KINDS),
  ...Object.values(EMG_ATTACHMENT_KINDS),
  ...Object.values(PSG_ATTACHMENT_KINDS),
];
