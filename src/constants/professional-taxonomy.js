export const PROFESSIONAL_SPECIALIZATIONS = [
  "Neurologia",
  "Pneumologia",
  "Allergologia",
  "Medicina Interna",
  "Cardiologia",
  "Dermatologia",
  "Endocrinologia",
  "Ginecologia",
  "Urologia",
  "Reumatologia",
  "Chirurgia Vascolare",
  "Dietologia",
  "Dietistica",
  "Medicina Estetica",
  "Psicoterapia",
  "Ostetricia",
  "Tecniche di Neurofisiopatologia",
  "Medicina Generale",
  "Senologia",
  "Biologia nutrizionale",
  "Chirurgia Plastica",
  "Chirurgia maxillo-facciale",
  "Altro",
];

export const REFERTATORE_SPECIALIZATION_RULES = {
  emg: ["Neurologia"],
  psg: ["Neurologia", "Pneumologia", "Allergologia"],
};

export function normalizeProfessionalSpecialization(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "tecnico di neurofisiopatologia") {
    return "Tecniche di Neurofisiopatologia";
  }

  const match = PROFESSIONAL_SPECIALIZATIONS.find(
    (item) => item.toLowerCase() === normalized,
  );

  return match || null;
}

export function canAssignRefertatoreToType(specializzazione, tipoReferto) {
  const normalizedSpecialization =
    normalizeProfessionalSpecialization(specializzazione);
  const allowed =
    REFERTATORE_SPECIALIZATION_RULES[tipoReferto] || [];

  if (!normalizedSpecialization) {
    return false;
  }

  return allowed.includes(normalizedSpecialization);
}

export function isCompatibleRefertatoreSpecialization(specializzazione) {
  const normalizedSpecialization =
    normalizeProfessionalSpecialization(specializzazione);

  return Boolean(
    normalizedSpecialization &&
      (canAssignRefertatoreToType(normalizedSpecialization, "emg") ||
        canAssignRefertatoreToType(normalizedSpecialization, "psg")),
  );
}
