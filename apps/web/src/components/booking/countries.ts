/** Billing countries offered at checkout. Dodo test cards must match the billing country. */
export const COUNTRIES: [code: string, name: string][] = [
  ["AU", "Australia"],
  ["BR", "Brazil"],
  ["CA", "Canada"],
  ["DE", "Germany"],
  ["ES", "Spain"],
  ["FR", "France"],
  ["GB", "United Kingdom"],
  ["IE", "Ireland"],
  ["IN", "India"],
  ["IT", "Italy"],
  ["JP", "Japan"],
  ["MX", "Mexico"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["SE", "Sweden"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["US", "United States"],
];

export function guessCountry(): string {
  if (typeof navigator === "undefined") return "US";
  const region = navigator.language.split("-")[1]?.toUpperCase();
  return COUNTRIES.some(([code]) => code === region) ? region! : "US";
}
