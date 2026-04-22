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
        label: "Ready to Build",
        folderName: "ready-to-build",
        viewId: "scaffold.readyToBuild",
        supportedFileExtensions: [".md"],
        defaultFileExtension: ".md",
        hasGate: true
    },
    {
        key: "build",
        label: "Build",
        folderName: "build",
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
//# sourceMappingURL=models.js.map