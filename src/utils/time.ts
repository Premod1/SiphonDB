// SQLite CURRENT_TIMESTAMP stores UTC but without a timezone marker
// ("YYYY-MM-DD HH:MM:SS"), so `new Date()` parses it as local time and
// rendered timestamps drift by the machine's UTC offset. Normalize the
// plain SQLite format to a UTC ISO string; values that already carry an
// explicit timezone (ISO strings from other engines) parse as-is.
export const parseTimestamp = (ts: string): Date => {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(ts)) {
    return new Date(ts);
  }
  return new Date(ts.replace(" ", "T") + "Z");
};
