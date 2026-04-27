/**
 * Active Paratus Group countries — v1 launch set.
 *
 * 12 active countries route to live dashboards. The 3 coming-soon countries
 * (Lesotho, Malawi, Zimbabwe) are seeded in the data model but their dashboard
 * routes stay 404 until Paratus signals activation (handled in the retainer).
 *
 * Slugs are lowercase and used in URL paths: /[country], /[country]/queue.
 */
export const ACTIVE_COUNTRIES = {
  angola: "Angola",
  botswana: "Botswana",
  drc: "DRC",
  eswatini: "Eswatini",
  kenya: "Kenya",
  mozambique: "Mozambique",
  namibia: "Namibia",
  rwanda: "Rwanda",
  "south-africa": "South Africa",
  tanzania: "Tanzania",
  uganda: "Uganda",
  zambia: "Zambia",
} as const satisfies Record<string, string>;

export type CountrySlug = keyof typeof ACTIVE_COUNTRIES;

export function isActiveCountry(slug: string): slug is CountrySlug {
  return Object.prototype.hasOwnProperty.call(ACTIVE_COUNTRIES, slug);
}

export function countryName(slug: CountrySlug): string {
  return ACTIVE_COUNTRIES[slug];
}
