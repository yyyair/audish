export interface Campaign {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  file: string;        // workspace-relative, forward slashes
  line: number;        // 0-based
  description: string;
  createdAt: string;
}

export interface CoverageData {
  [file: string]: number[];  // workspace-relative -> sorted 0-based line numbers
}

export interface CodeLink {
  file: string;        // workspace-relative; empty string for deferred symbol links
  line: number;        // 0-based
  label: string;
  symbolQuery?: string; // set for unresolved @#symbol refs; resolved lazily on click
}

export interface Comment {
  id: string;
  file: string;        // workspace-relative
  line: number;        // 0-based
  text: string;
  links: CodeLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignData {
  campaigns: Campaign[];
  activeCampaignId?: string;
}
