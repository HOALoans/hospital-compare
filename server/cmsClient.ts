const CMS_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query";

export const DATASETS = {
  hospitals: "xubh-q36u",
  hcahps: "dgck-syfz",
  hai: "77hc-ibv8",
  readmissions: "9n3s-kdb3",
  hcahpsNational: "99ue-w85f",
  hcahpsState: "84jm-wiui",
} as const;

type Operator = "=" | "<>" | "<" | "<=" | ">" | ">=";

export interface QueryCondition {
  property: string;
  value: string;
  operator?: Operator;
}

export interface CmsQueryOptions {
  dataset: string;
  conditions?: QueryCondition[];
  limit?: number;
  offset?: number;
}

function buildQueryUrl({ dataset, conditions = [], limit = 500, offset = 0 }: CmsQueryOptions): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  conditions.forEach((c, i) => {
    params.set(`conditions[${i}][property]`, c.property);
    params.set(`conditions[${i}][value]`, c.value);
    params.set(`conditions[${i}][operator]`, c.operator ?? "=");
  });
  return `${CMS_BASE}/${dataset}/0?${params.toString()}`;
}

export async function cmsQuery<T extends Record<string, unknown>>(
  options: CmsQueryOptions,
): Promise<{ results: T[]; count: number }> {
  const url = buildQueryUrl(options);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CMS API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{ results: T[]; count: number }>;
}

export async function cmsQueryAll<T extends Record<string, unknown>>(
  options: Omit<CmsQueryOptions, "offset" | "limit">,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await cmsQuery<T>({ ...options, limit: pageSize, offset });
    total = page.count;
    all.push(...page.results);
    if (page.results.length === 0) break;
    offset += page.results.length;
  }

  return all;
}
