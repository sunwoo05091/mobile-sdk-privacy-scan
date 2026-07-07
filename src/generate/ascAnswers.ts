// App Store Connect "App Privacy" answer sheet.
//
// This is a SEPARATE deliverable from PrivacyInfo.xcprivacy: the nutrition
// label has no import and no API — it is filled in through ASC's web
// questionnaire only. This sheet answers that questionnaire's actual
// questions, with the evidence for each answer.
import type { AppleCollectedType } from "../types.js";

/** NSPrivacyCollectedDataType… → ASC questionnaire (section, item). */
const ASC_SECTION: Record<string, [string, string]> = {
  NSPrivacyCollectedDataTypeName: ["Contact Info", "Name"],
  NSPrivacyCollectedDataTypeEmailAddress: ["Contact Info", "Email Address"],
  NSPrivacyCollectedDataTypePhoneNumber: ["Contact Info", "Phone Number"],
  NSPrivacyCollectedDataTypePhysicalAddress: ["Contact Info", "Physical Address"],
  NSPrivacyCollectedDataTypeOtherUserContactInfo: ["Contact Info", "Other User Contact Info"],
  NSPrivacyCollectedDataTypeHealth: ["Health & Fitness", "Health"],
  NSPrivacyCollectedDataTypeFitness: ["Health & Fitness", "Fitness"],
  NSPrivacyCollectedDataTypePaymentInfo: ["Financial Info", "Payment Info"],
  NSPrivacyCollectedDataTypeCreditInfo: ["Financial Info", "Credit Info"],
  NSPrivacyCollectedDataTypeOtherFinancialInfo: ["Financial Info", "Other Financial Info"],
  NSPrivacyCollectedDataTypePreciseLocation: ["Location", "Precise Location"],
  NSPrivacyCollectedDataTypeCoarseLocation: ["Location", "Coarse Location"],
  NSPrivacyCollectedDataTypeSensitiveInfo: ["Sensitive Info", "Sensitive Info"],
  NSPrivacyCollectedDataTypeContacts: ["Contacts", "Contacts"],
  NSPrivacyCollectedDataTypeEmailsOrTextMessages: ["User Content", "Emails or Text Messages"],
  NSPrivacyCollectedDataTypePhotosorVideos: ["User Content", "Photos or Videos"],
  NSPrivacyCollectedDataTypeAudioData: ["User Content", "Audio Data"],
  NSPrivacyCollectedDataTypeGameplayContent: ["User Content", "Gameplay Content"],
  NSPrivacyCollectedDataTypeCustomerSupport: ["User Content", "Customer Support"],
  NSPrivacyCollectedDataTypeOtherUserContent: ["User Content", "Other User Content"],
  NSPrivacyCollectedDataTypeBrowsingHistory: ["Browsing History", "Browsing History"],
  NSPrivacyCollectedDataTypeSearchHistory: ["Search History", "Search History"],
  NSPrivacyCollectedDataTypeUserID: ["Identifiers", "User ID"],
  NSPrivacyCollectedDataTypeDeviceID: ["Identifiers", "Device ID"],
  NSPrivacyCollectedDataTypePurchaseHistory: ["Purchases", "Purchase History"],
  NSPrivacyCollectedDataTypeProductInteraction: ["Usage Data", "Product Interaction"],
  NSPrivacyCollectedDataTypeAdvertisingData: ["Usage Data", "Advertising Data"],
  NSPrivacyCollectedDataTypeOtherUsageData: ["Usage Data", "Other Usage Data"],
  NSPrivacyCollectedDataTypeCrashData: ["Diagnostics", "Crash Data"],
  NSPrivacyCollectedDataTypePerformanceData: ["Diagnostics", "Performance Data"],
  NSPrivacyCollectedDataTypeOtherDiagnosticData: ["Diagnostics", "Other Diagnostic Data"],
  NSPrivacyCollectedDataTypeEnvironmentScanning: ["Surroundings", "Environment Scanning"],
  NSPrivacyCollectedDataTypeHands: ["Body", "Hands"],
  NSPrivacyCollectedDataTypeHead: ["Body", "Head"],
  NSPrivacyCollectedDataTypeOtherDataTypes: ["Other Data", "Other Data Types"],
};

const ASC_PURPOSE: Record<string, string> = {
  NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising: "Third-Party Advertising",
  NSPrivacyCollectedDataTypePurposeDeveloperAdvertising: "Developer's Advertising or Marketing",
  NSPrivacyCollectedDataTypePurposeAnalytics: "Analytics",
  NSPrivacyCollectedDataTypePurposeProductPersonalization: "Product Personalization",
  NSPrivacyCollectedDataTypePurposeAppFunctionality: "App Functionality",
  NSPrivacyCollectedDataTypePurposeOther: "Other Purposes",
};

export function generateAscAnswers(
  types: AppleCollectedType[],
  /** Who contributes each data type: SDK names or "your app (…)". */
  contributors: Record<string, string[]>,
): string {
  const lines = [
    "# App Store Connect — App Privacy answers (draft)",
    "",
    "> This is NOT the PrivacyInfo.xcprivacy file. The App Privacy \"nutrition",
    "> label\" has no import and no API — it is answered in App Store Connect's",
    "> web questionnaire (App Privacy section). This sheet follows that",
    "> questionnaire. Verify every answer; not legal advice.",
    "",
    "## Q: Do you or your third-party partners collect data from this app?",
    "",
    types.length ? "**Answer: Yes.** Then select the data types below." : "**Answer: No** — nothing detected. Verify your backend collects nothing either.",
    "",
  ];

  const bySection = new Map<string, { item: string; t: AppleCollectedType }[]>();
  for (const t of types) {
    const [section, item] = ASC_SECTION[t.type] ?? ["Other Data", t.type];
    const list = bySection.get(section) ?? [];
    list.push({ item, t });
    bySection.set(section, list);
  }

  for (const [section, items] of [...bySection.entries()].sort()) {
    lines.push(`## ${section}`);
    for (const { item, t } of items.sort((a, b) => a.item.localeCompare(b.item))) {
      const from = contributors[t.type] ?? [];
      const purposes = t.purposes
        .map((p) => ASC_PURPOSE[p] ?? p)
        .sort()
        .join(", ");
      lines.push(
        "",
        `### ${item}`,
        `- Collected: **Yes** ${from.length ? `(from: ${from.join(", ")})` : ""}`,
        `- Used for tracking: **${t.tracking ? "Yes" : "No"}**`,
        `- Linked to the user's identity: **${t.linked ? "Yes" : "No"}**` +
          (t.linked ? "" : " — REVIEW: if your app has accounts/login and this data ties to them, answer Yes"),
        `- Purposes: ${purposes || "(none declared — REVIEW)"}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Not visible to scanning — answer these yourself",
    "",
    "- Data your backend collects (account sign-up, login, identity",
    "  verification: names, phone numbers, national IDs).",
    "- Whether any collected data is OPTIONAL for the user, and your data",
    "  retention/deletion story.",
    "",
  );
  return lines.join("\n");
}
