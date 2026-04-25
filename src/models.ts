export type FileStatus = "editing" | "finalized";

export type SectionKey = "knowledgeBase" | "prd" | "design" | "engineeringPlan" | "readyToBuild";

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  folderName: string;
  viewId: string;
  supportedFileExtensions: string[];
  defaultFileExtension: string;
  isBacklogSection?: boolean;
}

export interface FileStateRecord {
  status: FileStatus;
  finalizedAt?: string;
}

export type FileStateMap = Record<string, FileStateRecord>;

export interface ScaffoldConfig {
  dataFolder: string;
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
    defaultFileExtension: ".md"
  },
  {
    key: "prd",
    label: "Product Requirement Document",
    folderName: "prd",
    viewId: "scaffold.prd",
    supportedFileExtensions: [".md"],
    defaultFileExtension: ".md"
  },
  {
    key: "design",
    label: "UI Design",
    folderName: "design",
    viewId: "scaffold.design",
    supportedFileExtensions: [".html"],
    defaultFileExtension: ".html"
  },
  {
    key: "engineeringPlan",
    label: "Engineering Plan",
    folderName: "engineering-plan",
    viewId: "scaffold.engineeringPlan",
    supportedFileExtensions: [".md", ".puml"],
    defaultFileExtension: ".md"
  },
  {
    key: "readyToBuild",
    label: "Task Plan",
    folderName: "ready-to-code",
    viewId: "scaffold.readyToBuild",
    supportedFileExtensions: [".md"],
    defaultFileExtension: ".md",
    isBacklogSection: true
  }
];
