export const CATEGORIES = ["electronics", "furniture", "clothing", "tools", "outdoors", "vehicles", "home", "collectibles", "other"] as const;
export const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
