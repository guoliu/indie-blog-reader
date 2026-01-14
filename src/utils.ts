/** Get today's date in NYC timezone (America/New_York) as YYYY-MM-DD */
export function getTodayNYC(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
