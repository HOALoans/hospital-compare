import type { MeasureDataset } from "./measures.js";

export interface MeasureHelp {
  plainEnglish: string;
  sourceUrl: string;
  sourceLabel: string;
}

const HCAHPS_SOURCE = "https://data.cms.gov/provider-data/dataset/dgck-syfz";
const HAI_SOURCE = "https://data.cms.gov/provider-data/dataset/77hc-ibv8";
const READMISSION_SOURCE = "https://data.cms.gov/provider-data/dataset/9n3s-kdb3";

export const MEASURE_HELP: Record<string, MeasureHelp> = {
  H_HSP_RATING_LINEAR_SCORE: {
    plainEnglish:
      "Patients rated their overall hospital experience on a 0–100 scale. Higher means patients felt better cared for overall.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_STAR_RATING: {
    plainEnglish:
      "CMS combines several patient-survey topics into a single 1–5 star summary. More stars mean better reported experience.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_COMP_1_LINEAR_SCORE: {
    plainEnglish:
      "How well nurses explained things, listened, and treated patients with courtesy and respect.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_COMP_2_LINEAR_SCORE: {
    plainEnglish:
      "How well doctors explained care, listened to concerns, and treated patients respectfully.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_COMP_5_LINEAR_SCORE: {
    plainEnglish:
      "How quickly staff responded when patients pressed the call button or asked for help.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_QUIET_LINEAR_SCORE: {
    plainEnglish:
      "How often the area around the patient's room was quiet at night — important for rest and recovery.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_CLEAN_LINEAR_SCORE: {
    plainEnglish:
      "How often the patient's room and bathroom were kept clean during the stay.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_COMP_6_LINEAR_SCORE: {
    plainEnglish:
      "Whether patients got clear written information about symptoms and care after leaving the hospital.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  H_RECMND_LINEAR_SCORE: {
    plainEnglish:
      "The share of patients who said they would definitely recommend this hospital to friends and family.",
    sourceUrl: HCAHPS_SOURCE,
    sourceLabel: "CMS HCAHPS dataset",
  },
  HAI_1_SIR: {
    plainEnglish:
      "Central-line bloodstream infections compared to what CMS expects for similar hospitals. Below 1.0 is better than expected; above 1.0 is worse.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  HAI_2_SIR: {
    plainEnglish:
      "Catheter-related urinary tract infections vs. national baseline. Lower ratios mean fewer infections than expected.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  HAI_3_SIR: {
    plainEnglish:
      "Surgical site infections after colon surgery, adjusted for hospital patient mix. Lower is better.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  HAI_4_SIR: {
    plainEnglish:
      "Surgical site infections after hysterectomy, risk-adjusted. Lower ratios indicate fewer infections.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  HAI_5_SIR: {
    plainEnglish:
      "MRSA bloodstream infections compared to the national baseline. A ratio below 1.0 means fewer than expected.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  HAI_6_SIR: {
    plainEnglish:
      "C. diff intestinal infections vs. expected levels. Lower standardized ratios mean better infection control.",
    sourceUrl: HAI_SOURCE,
    sourceLabel: "CMS HAI dataset",
  },
  READM_30_AMI: {
    plainEnglish:
      "Patients readmitted within 30 days after a heart attack (AMI). Lower percentages mean fewer unplanned return visits.",
    sourceUrl: READMISSION_SOURCE,
    sourceLabel: "CMS Readmissions dataset",
  },
  READM_30_HF: {
    plainEnglish:
      "Heart failure patients readmitted within 30 days of discharge. Lower is better for care transitions.",
    sourceUrl: READMISSION_SOURCE,
    sourceLabel: "CMS Readmissions dataset",
  },
  READM_30_PN: {
    plainEnglish:
      "Pneumonia patients readmitted within 30 days. Reflects discharge planning and follow-up quality.",
    sourceUrl: READMISSION_SOURCE,
    sourceLabel: "CMS Readmissions dataset",
  },
  READM_30_COPD: {
    plainEnglish:
      "COPD patients readmitted within 30 days. Lower rates suggest better outpatient coordination.",
    sourceUrl: READMISSION_SOURCE,
    sourceLabel: "CMS Readmissions dataset",
  },
  READM_30_HIP_KNEE: {
    plainEnglish:
      "Hip/knee replacement patients readmitted within 30 days. Lower percentages indicate smoother recovery.",
    sourceUrl: READMISSION_SOURCE,
    sourceLabel: "CMS Readmissions dataset",
  },
};

export function getMeasureHelp(measureId: string): MeasureHelp | undefined {
  return MEASURE_HELP[measureId];
}

export function defaultSourceForDataset(dataset: MeasureDataset): { url: string; label: string } {
  if (dataset === "hai") return { url: HAI_SOURCE, label: "CMS HAI dataset" };
  if (dataset === "readmissions") return { url: READMISSION_SOURCE, label: "CMS Readmissions dataset" };
  return { url: HCAHPS_SOURCE, label: "CMS HCAHPS dataset" };
}
