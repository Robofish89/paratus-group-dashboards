/**
 * Active Paratus Group countries — v1 launch set, keyed by ISO 3166-1 alpha-2
 * URL slug (lowercase). Routes use the same slug as the JWT `country_code`
 * claim so middleware can compare them without a translation step.
 *
 * 12 active countries route to live dashboards. The 3 coming-soon countries
 * (LS Lesotho, MW Malawi, ZW Zimbabwe) are seeded in the data model but their
 * dashboard routes stay 404 until Paratus signals activation.
 */
export const ACTIVE_COUNTRIES = {
  ao: "Angola",
  bw: "Botswana",
  cd: "DRC",
  sz: "Eswatini",
  ke: "Kenya",
  mz: "Mozambique",
  na: "Namibia",
  rw: "Rwanda",
  za: "South Africa",
  tz: "Tanzania",
  ug: "Uganda",
  zm: "Zambia",
} as const satisfies Record<string, string>;

export type CountrySlug = keyof typeof ACTIVE_COUNTRIES;

export function isActiveCountry(slug: string): slug is CountrySlug {
  return Object.prototype.hasOwnProperty.call(ACTIVE_COUNTRIES, slug);
}

export function countryName(slug: CountrySlug): string {
  return ACTIVE_COUNTRIES[slug];
}
