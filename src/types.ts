// Shared types for the scanner.

export type Ecosystem = "pub" | "npm" | "pod" | "gradle";

/** A dependency discovered in the user's project. */
export interface DetectedDependency {
  /** Raw name as it appears in the lockfile (e.g. "firebase_analytics", "Firebase/Analytics"). */
  name: string;
  ecosystem: Ecosystem;
  version?: string;
  /** true = declared directly by the app, false = pulled in transitively. */
  direct: boolean;
  /** Where we found it, for reporting. */
  source: string;
}

/** One Apple "collected data type" declaration. */
export interface AppleCollectedType {
  /** e.g. "NSPrivacyCollectedDataTypeProductInteraction" */
  type: string;
  linked: boolean;
  tracking: boolean;
  /** e.g. ["NSPrivacyCollectedDataTypePurposeAnalytics"] */
  purposes: string[];
}

/** One Google Play Data Safety row. */
export interface PlayCollectedType {
  category: string; // e.g. "App activity"
  type: string; // e.g. "App interactions"
  collected: boolean;
  shared: boolean;
  purposes: string[];
}

/** A single Knowledge Base entry: what one SDK collects. */
export interface KbEntry {
  id: string;
  name: string;
  aliases: Partial<Record<Ecosystem, string[]>>;
  tracking: boolean;
  trackingDomains: string[];
  apple: AppleCollectedType[];
  play: PlayCollectedType[];
  /** Provenance note. SEED entries must be verified before shipping. */
  source: string;
  lastVerified?: string;
}

/** A parsed PrivacyInfo.xcprivacy that an SDK ships inside its own package. */
export interface HarvestedManifest {
  /** Absolute path of the file on disk. */
  path: string;
  /** Which dependency ships it, derived from the path. Absent if unattributable. */
  owner?: { ecosystem: Ecosystem; name: string };
  tracking: boolean;
  trackingDomains: string[];
  apple: AppleCollectedType[];
}

/** A dependency we matched to a KB entry. */
export interface ResolvedSdk {
  dependency: DetectedDependency;
  entry: KbEntry;
  /**
   * Manifests this SDK ships itself. When present they REPLACE the KB entry's
   * Apple data (the SDK's own declaration beats our seed data).
   */
  harvested?: HarvestedManifest[];
}

export interface ScanResult {
  projectType: ("flutter" | "react-native")[];
  detected: DetectedDependency[];
  resolved: ResolvedSdk[];
  /** Detected deps we have no KB data for. These are the ones the user must check by hand. */
  unknown: DetectedDependency[];
  /** PrivacyInfo.xcprivacy files already shipped inside dependencies on disk. */
  harvestedManifests: HarvestedManifest[];
  /** Manifest files we found but could not parse. */
  harvestErrors: string[];
}
