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
};
