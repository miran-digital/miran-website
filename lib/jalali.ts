const persianDateFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-persian-nu-latn",
  {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  },
);

const persianDateTimeFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

const persianLongDateFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    timeZone: "Asia/Tehran",
    dateStyle: "long",
  },
);

const persianLongDateTimeFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    timeZone: "Asia/Tehran",
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: "h23",
  },
);

const persianYearFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    timeZone: "Asia/Tehran",
    year: "numeric",
  },
);

const gregorianInputFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-gregory",
  {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

const gregorianLongDateTimeFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-gregory",
  {
    timeZone: "Asia/Tehran",
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: "h23",
  },
);

const gregorianYearFormatter = new Intl.DateTimeFormat(
  "fa-IR-u-ca-gregory",
  {
    timeZone: "Asia/Tehran",
    year: "numeric",
  },
);

export type CalendarMode = "jalali" | "gregorian";

const latinDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const persianDigits = (value: string) =>
  value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)] ?? digit);

function getNumericParts(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(latinDigits(part.value))]),
  ) as Record<string, number>;
}

function parseStoredDateTime(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return new Date(`${trimmed.replace(" ", "T")}Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return new Date(`${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+03:30`);
  }
  return new Date(trimmed);
}

export function dateTimeTimestamp(value: string) {
  if (!value) return Number.NaN;
  return parseStoredDateTime(value).getTime();
}

function jalaliToGregorian(year: number, month: number, day: number) {
  const start = Date.UTC(year + 621, 1, 15);
  const end = Date.UTC(year + 622, 4, 15);
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const candidate = new Date(timestamp);
    const parts = getNumericParts(persianDateFormatter, candidate);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day
    ) {
      return {
        year: candidate.getUTCFullYear(),
        month: candidate.getUTCMonth() + 1,
        day: candidate.getUTCDate(),
      };
    }
  }
  return null;
}

export function jalaliDateTimeToIso(dateValue: string, timeValue: string) {
  const dateMatch = latinDigits(dateValue.trim()).match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,
  );
  const timeMatch = latinDigits(timeValue.trim()).match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return "";
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    year < 1200 ||
    year > 1600 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }
  const gregorian = jalaliToGregorian(year, month, day);
  if (!gregorian) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  const localIranTime = `${gregorian.year}-${pad(gregorian.month)}-${pad(
    gregorian.day,
  )}T${pad(hour)}:${pad(minute)}:00+03:30`;
  const parsed = new Date(localIranTime);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

export function gregorianDateTimeToIso(dateValue: string, timeValue: string) {
  const dateMatch = latinDigits(dateValue.trim()).match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,
  );
  const timeMatch = latinDigits(timeValue.trim()).match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return "";
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    year < 1900 ||
    year > 2300 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) return "";
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  const value = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:30`;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

export function calendarDateTimeToIso(
  dateValue: string,
  timeValue: string,
  mode: CalendarMode,
) {
  return mode === "gregorian"
    ? gregorianDateTimeToIso(dateValue, timeValue)
    : jalaliDateTimeToIso(dateValue, timeValue);
}

export function isoToJalaliInput(value: string) {
  if (!value) return { date: "", time: "" };
  const parsed = parseStoredDateTime(value);
  if (!Number.isFinite(parsed.getTime())) return { date: "", time: "" };
  const parts = persianDateTimeFormatter.formatToParts(parsed);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${valueOf("year")}/${valueOf("month")}/${valueOf("day")}`,
    time: persianDigits(
      `${latinDigits(valueOf("hour"))}:${latinDigits(valueOf("minute"))}`,
    ),
  };
}

export function isoToCalendarInput(value: string, mode: CalendarMode) {
  if (mode === "jalali") return isoToJalaliInput(value);
  if (!value) return { date: "", time: "" };
  const parsed = parseStoredDateTime(value);
  if (!Number.isFinite(parsed.getTime())) return { date: "", time: "" };
  const parts = gregorianInputFormatter.formatToParts(parsed);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${valueOf("year")}/${valueOf("month")}/${valueOf("day")}`,
    time: persianDigits(
      `${latinDigits(valueOf("hour"))}:${latinDigits(valueOf("minute"))}`,
    ),
  };
}

export function formatJalaliDateTime(value: string) {
  if (!value) return "";
  const parsed = parseStoredDateTime(value);
  return Number.isFinite(parsed.getTime())
    ? persianLongDateTimeFormatter.format(parsed)
    : "";
}

export function formatJalaliDate(value: string) {
  if (!value) return "";
  const parsed = parseStoredDateTime(value);
  return Number.isFinite(parsed.getTime())
    ? persianLongDateFormatter.format(parsed)
    : "";
}

export function currentJalaliYear(date = new Date()) {
  return persianYearFormatter.format(date);
}

export function formatCalendarDateTime(value: string, mode: CalendarMode) {
  if (mode === "jalali") return formatJalaliDateTime(value);
  if (!value) return "";
  const parsed = parseStoredDateTime(value);
  return Number.isFinite(parsed.getTime())
    ? gregorianLongDateTimeFormatter.format(parsed)
    : "";
}

export function currentCalendarYear(mode: CalendarMode, date = new Date()) {
  return mode === "jalali"
    ? persianYearFormatter.format(date)
    : gregorianYearFormatter.format(date);
}

export function jalaliPlaceholder() {
  return persianDigits("1405/05/23");
}

export function jalaliTimePlaceholder() {
  return persianDigits("12:30");
}

export function calendarDatePlaceholder(mode: CalendarMode) {
  return mode === "jalali"
    ? jalaliPlaceholder()
    : persianDigits("2026/08/14");
}
