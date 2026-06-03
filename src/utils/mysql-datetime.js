export function parseMysqlDateTimeUtc(value) {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  ) {
    return new Date(value.replace(" ", "T") + "Z");
  }

  return new Date(value);
}
