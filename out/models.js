"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECTIONS = void 0;
exports.SECTIONS = [
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
        supportedFileExtensions: [".md", ".html"],
        defaultFileExtension: ".md"
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
        folderName: "tasks",
        viewId: "scaffold.readyToBuild",
        supportedFileExtensions: [".md"],
        defaultFileExtension: ".md",
        isBacklogSection: true
    }
];
//# sourceMappingURL=models.js.map