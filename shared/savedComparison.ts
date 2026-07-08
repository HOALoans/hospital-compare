/** Serializable comparison state stored server-side for "save for later" links. */
export type SavedComparisonPayload = {
  hospitalId: string;
  compareWith: string[];
  peers: string[];
  stateFilter: string;
  groupFilter: string;
  partner?: string;
};

export type SavedComparisonRecord = SavedComparisonPayload & {
  code: string;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveComparisonRequest = SavedComparisonPayload & {
  label?: string;
  code?: string;
};

export type SaveComparisonResponse = {
  code: string;
  label: string;
  shareUrl: string;
  createdAt: string;
  updatedAt: string;
};
