export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type AccountProfile = {
  handle: string;
  displayName: string;
  bio: string;
  about: string;
  profession: string;
  location: string;
  /** Profile photo from relay /v1/media/:cid */
  avatarCid?: string | null;
  /** Banner image behind the profile header on /u/:handle */
  headerCid?: string | null;
  /** Full-page background behind the draggable homepage grid */
  pageBackgroundCid?: string | null;
  /** @deprecated Use headerCid; relay maps this to header for old clients */
  coverCid?: string | null;
  socialLinks: Record<string, string>;
  settings: {
    compactFeed: boolean;
    showMetricsInline: boolean;
    highContrast: boolean;
    reduceMotion: boolean;
    communityFeedUnlocked: boolean;
  };
  layout: { cols: number; rowHeight: number; items: LayoutItem[] };
  linkedWallets: string[];
  /** Optional preferred wallet for Merkle reward claims */
  payoutAddress?: string | null;
  /** Lowercase handles this profile follows */
  following?: string[];
};
