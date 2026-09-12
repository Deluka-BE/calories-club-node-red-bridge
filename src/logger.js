const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset"
});

function timestamp() {
  const parts = formatter.formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")} ${value("timeZoneName")}`;
}

export function installTimestampedConsole() {
  if (globalThis.__caloriesClubTimestampedConsole) return;
  globalThis.__caloriesClubTimestampedConsole = true;

  for (const method of ["log", "info", "warn", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => original(`[${timestamp()}]`, ...args);
  }
}
