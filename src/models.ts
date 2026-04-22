export type SectionStatus = "LOCKED" | "PENDING_REVIEW" | "APPROVED";

export type SectionKey = "knowledgeBase" | "prd" | "design" | "engineeringPlan" | "readyToBuild" | "build";

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  folderName: string;
  viewId: string;
  supportedFileExtensions: string[];
  defaultFileExtension: string;
  hasGate: boolean;
}

export interface SectionState {
  section: SectionKey;
  status: SectionStatus;
  approvedAt: string | null;
  comment: string | null;
  updatedAt: string;
}

export interface FileApproval {
  approvedAt: string;
  comment: string | null;
}

export type FileApprovals = Record<string, FileApproval>;

export interface ScaffoldConfig {
  dataFolder: string;
  gateMode: "strict" | "flexible";
}

export const SECTIONS: SectionDefinition[] = [
  {
    key: "knowledgeBase",
    label: "Knowledge Base",
    folderName: "knowledge-base",
    viewId: "scaffold.knowledgeBase",
    supportedFileExtensions: [
      ".md",
      ".txt",
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".csv",
      ".puml",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".sh",
      ".sql",
      ".toml",
      ".ini",
      ".env"
    ],
    defaultFileExtension: ".md",
    hasGate: false
  },
  {
    key: "prd",
    label: "Product Requirement Document",
    folderName: "prd",
    viewId: "scaffold.prd",
    supportedFileExtensions: [".md"],
    defaultFileExtension: ".md",
    hasGate: true
  },
  {
    key: "design",
    label: "Design",
    folderName: "design",
    viewId: "scaffold.design",
    supportedFileExtensions: [".html"],
    defaultFileExtension: ".html",
    hasGate: true
  },
  {
    key: "engineeringPlan",
    label: "Engineering Plan",
    folderName: "engineering-plan",
    viewId: "scaffold.engineeringPlan",
    supportedFileExtensions: [".md", ".puml"],
    defaultFileExtension: ".md",
    hasGate: true
  },
  {
    key: "readyToBuild",
    label: "Ready to Code",
    folderName: "ready-to-code",
    viewId: "scaffold.readyToBuild",
    supportedFileExtensions: [".md"],
    defaultFileExtension: ".md",
    hasGate: true
  },
  {
    key: "build",
    label: "Code",
    folderName: "code",
    viewId: "scaffold.build",
    supportedFileExtensions: [
      ".md",
      ".txt",
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".csv",
      ".puml",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".sh",
      ".sql",
      ".toml",
      ".ini",
      ".env"
    ],
    defaultFileExtension: ".md",
    hasGate: false
  }
];
