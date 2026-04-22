"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScaffoldStorage = void 0;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const models_1 = require("./models");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BUILD_MANUAL_LOG_FILE = "manual-change-log.md";
function nowIso() {
    return new Date().toISOString();
}
function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
function normalizeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function toTitle(value) {
    const base = value.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    if (!base) {
        return "New File";
    }
    return base
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
class ScaffoldStorage {
    workspaceFolder;
    constructor(workspaceFolder) {
        this.workspaceFolder = workspaceFolder;
    }
    getConfig() {
        const cfg = vscode.workspace.getConfiguration("scaffold", this.workspaceFolder.uri);
        const dataFolder = cfg.get("dataFolder", ".scaffold");
        const gateMode = cfg.get("gateMode", "strict");
        return { dataFolder, gateMode };
    }
    getDataRootUri() {
        const { dataFolder } = this.getConfig();
        return vscode.Uri.joinPath(this.workspaceFolder.uri, dataFolder);
    }
    getProjectsRootUri() {
        return vscode.Uri.joinPath(this.getDataRootUri(), "projects");
    }
    async initialize() {
        await this.ensureDir(this.getProjectsRootUri());
    }
    async listProjects() {
        const projectsRoot = this.getProjectsRootUri();
        await this.ensureDir(projectsRoot);
        const entries = await vscode.workspace.fs.readDirectory(projectsRoot);
        const projects = [];
        for (const [name, fileType] of entries) {
            if (fileType !== vscode.FileType.Directory) {
                continue;
            }
            const metaUri = vscode.Uri.joinPath(projectsRoot, name, ".meta.json");
            const meta = await this.readJson(metaUri);
            if (meta) {
                projects.push(meta);
            }
        }
        return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    getProjectRootUri(projectId) {
        return vscode.Uri.joinPath(this.getProjectsRootUri(), projectId);
    }
    getProjectMetaUri(projectId) {
        return vscode.Uri.joinPath(this.getProjectRootUri(projectId), ".meta.json");
    }
    getSectionsStateUri(projectId) {
        return vscode.Uri.joinPath(this.getProjectRootUri(projectId), "sections.json");
    }
    /**
     * Returns the visible workspace-level path for section content files.
     * e.g. {workspaceRoot}/{projectId}/{sectionFolderName}/
     * Metadata (sections.json, approvals, etc.) stays in .scaffold.
     */
    getSectionRootUri(projectId, section) {
        const def = this.getSectionDefinition(section);
        return vscode.Uri.joinPath(this.workspaceFolder.uri, projectId, def.folderName);
    }
    /**
     * Returns the visible project content root: {workspaceRoot}/{projectId}/
     */
    getProjectContentRootUri(projectId) {
        return vscode.Uri.joinPath(this.workspaceFolder.uri, projectId);
    }
    getSectionApprovalsUri(projectId, section) {
        return vscode.Uri.joinPath(this.getProjectRootUri(projectId), ".approvals", `${section}.json`);
    }
    getSectionIndexUri(projectId, section) {
        return vscode.Uri.joinPath(this.getSectionRootUri(projectId, section), "index.md");
    }
    getBuildManualLogUri(projectId) {
        return vscode.Uri.joinPath(this.getSectionRootUri(projectId, "build"), BUILD_MANUAL_LOG_FILE);
    }
    async createProject(name) {
        const baseSlug = slugify(name) || "project";
        const projectId = `${baseSlug}-${Date.now()}`;
        const root = this.getProjectRootUri(projectId);
        const approvalsDir = vscode.Uri.joinPath(root, ".approvals");
        // Metadata folder (hidden)
        await this.ensureDir(root);
        await this.ensureDir(approvalsDir);
        // Visible content folders at workspace root
        for (const section of models_1.SECTIONS) {
            await this.ensureDir(this.getSectionRootUri(projectId, section.key));
        }
        const meta = {
            id: projectId,
            name,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            status: "active"
        };
        await this.writeJson(this.getProjectMetaUri(projectId), meta);
        const states = this.buildDefaultSectionStates();
        await this.writeJson(this.getSectionsStateUri(projectId), states);
        for (const section of models_1.SECTIONS) {
            const sectionRoot = this.getSectionRootUri(projectId, section.key);
            const overviewFile = `overview${this.getDefaultFileExtension(section.key)}`;
            const starter = vscode.Uri.joinPath(sectionRoot, overviewFile);
            await this.writeFile(starter, this.getStarterContent(section.key, overviewFile));
            await this.writeJson(this.getSectionApprovalsUri(projectId, section.key), {});
            await this.syncSectionIndex(projectId, section.key, { [overviewFile]: `${section.label} overview` });
        }
        await this.appendBuildManualChangeLog(projectId, "Build section initialized.");
        await this.appendActivity(projectId, `Project created: ${name}`);
        return meta;
    }
    async deleteProject(projectId) {
        const metaRoot = this.getProjectRootUri(projectId);
        const contentRoot = this.getProjectContentRootUri(projectId);
        await this.deleteIfExists(contentRoot);
        await this.deleteIfExists(metaRoot);
    }
    async importGeneratedOnboardingFolder(projectId, sourceRoot) {
        const sourceEntries = await vscode.workspace.fs.readDirectory(sourceRoot);
        const entryMap = new Map(sourceEntries.map(([name, type]) => [normalizeName(name), { name, type }]));
        let importedAnySection = false;
        for (const section of models_1.SECTIONS) {
            const candidates = new Set([
                normalizeName(section.folderName),
                normalizeName(section.key),
                normalizeName(section.label)
            ]);
            let matched;
            for (const candidate of candidates) {
                const found = entryMap.get(candidate);
                if (found && found.type === vscode.FileType.Directory) {
                    matched = found;
                    break;
                }
            }
            if (!matched) {
                continue;
            }
            const fromUri = vscode.Uri.joinPath(sourceRoot, matched.name);
            const toUri = this.getSectionRootUri(projectId, section.key);
            await this.ensureDir(toUri);
            await this.copyDirectoryContents(fromUri, toUri);
            await this.syncSectionIndex(projectId, section.key);
            // Auto-approve all files for gated sections so the approval chain is satisfied
            if (section.hasGate) {
                await this.autoApproveAllFilesInSection(projectId, section.key);
            }
            importedAnySection = true;
        }
        if (!importedAnySection) {
            throw new Error("No matching section folders found in selected import directory.");
        }
        // Mark all gated sections as APPROVED so the project is fully unlocked after import
        const states = await this.listSectionStates(projectId);
        for (const state of states) {
            const def = this.getSectionDefinition(state.section);
            if (def.hasGate && state.status !== "APPROVED") {
                state.status = "APPROVED";
                state.approvedAt = nowIso();
                state.updatedAt = nowIso();
            }
        }
        await this.writeJson(this.getSectionsStateUri(projectId), states);
        await this.setProjectUpdated(projectId);
        await this.appendActivity(projectId, `Imported onboarding output from: ${sourceRoot.fsPath}`);
    }
    async getProjectMeta(projectId) {
        return this.readJson(this.getProjectMetaUri(projectId));
    }
    async setProjectUpdated(projectId) {
        const meta = await this.getProjectMeta(projectId);
        if (!meta) {
            return;
        }
        meta.updatedAt = nowIso();
        await this.writeJson(this.getProjectMetaUri(projectId), meta);
    }
    async listSectionStates(projectId) {
        const defaultStates = this.buildDefaultSectionStates();
        const states = await this.readJson(this.getSectionsStateUri(projectId));
        if (!states) {
            return defaultStates;
        }
        return models_1.SECTIONS.map((section) => {
            const fallback = defaultStates.find((state) => state.section === section.key);
            const found = states.find((state) => state.section === section.key);
            if (found) {
                if (!section.hasGate) {
                    return {
                        ...found,
                        status: "APPROVED"
                    };
                }
                return found;
            }
            return fallback;
        });
    }
    async getSectionState(projectId, section) {
        const states = await this.listSectionStates(projectId);
        return states.find((state) => state.section === section);
    }
    async isSectionEditable(projectId, section) {
        if (!this.sectionHasGate(section)) {
            return true;
        }
        const state = await this.getSectionState(projectId, section);
        return state.status !== "LOCKED";
    }
    async getSectionApprovalSummary(projectId, section) {
        const files = await this.listAllSectionFileRelativePaths(projectId, section);
        const approvals = await this.readApprovals(projectId, section);
        const approvedFiles = files.filter((file) => Boolean(approvals[file])).length;
        return {
            totalFiles: files.length,
            approvedFiles,
            allApproved: files.length > 0 && files.length === approvedFiles
        };
    }
    async approveSection(projectId, section, comment) {
        if (!this.sectionHasGate(section)) {
            throw new Error("This section does not require approval.");
        }
        const states = await this.listSectionStates(projectId);
        const state = states.find((s) => s.section === section);
        if (!state) {
            throw new Error("Section state not found.");
        }
        if (state.status === "LOCKED") {
            throw new Error("Section is locked.");
        }
        if (state.status === "APPROVED") {
            return;
        }
        const summary = await this.getSectionApprovalSummary(projectId, section);
        if (!summary.allApproved) {
            throw new Error(`All files in ${this.getSectionDefinition(section).label} must be approved first.`);
        }
        state.status = "APPROVED";
        state.comment = comment;
        state.approvedAt = nowIso();
        state.updatedAt = nowIso();
        const gatedSections = models_1.SECTIONS.filter((s) => s.hasGate);
        const currentIndex = gatedSections.findIndex((s) => s.key === section);
        const next = gatedSections[currentIndex + 1];
        if (next) {
            const nextState = states.find((s) => s.section === next.key);
            if (nextState && nextState.status === "LOCKED") {
                nextState.status = "PENDING_REVIEW";
                nextState.updatedAt = nowIso();
            }
        }
        await this.writeJson(this.getSectionsStateUri(projectId), states);
        await this.setProjectUpdated(projectId);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} section approved`);
    }
    async approveFile(projectId, section, fileUri, comment) {
        if (!this.sectionHasGate(section)) {
            throw new Error("This section does not require file approval.");
        }
        const editable = await this.isSectionEditable(projectId, section);
        if (!editable) {
            throw new Error("Section is locked.");
        }
        const sectionRoot = this.getSectionRootUri(projectId, section);
        const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
        if (!relativePath || relativePath.startsWith("..") || !this.isSupportedSectionFilePath(section, relativePath)) {
            throw new Error("Only supported files within the section can be approved.");
        }
        const approvals = await this.readApprovals(projectId, section);
        approvals[relativePath] = {
            approvedAt: nowIso(),
            comment
        };
        await this.writeJson(this.getSectionApprovalsUri(projectId, section), approvals);
        await this.setProjectUpdated(projectId);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} file approved: ${relativePath}`);
    }
    async unlockSection(projectId, section) {
        if (!this.sectionHasGate(section)) {
            throw new Error("This section does not require unlock.");
        }
        const cfg = this.getConfig();
        if (cfg.gateMode !== "flexible") {
            throw new Error("Manual unlock is only allowed in flexible mode.");
        }
        const states = await this.listSectionStates(projectId);
        const state = states.find((s) => s.section === section);
        if (!state) {
            throw new Error("Section state not found.");
        }
        if (state.status === "LOCKED") {
            state.status = "PENDING_REVIEW";
            state.updatedAt = nowIso();
            await this.writeJson(this.getSectionsStateUri(projectId), states);
            await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} manually unlocked`);
        }
    }
    async createSectionFile(projectId, section, relativeDir, pageName, description) {
        const editable = await this.isSectionEditable(projectId, section);
        if (!editable) {
            throw new Error("Section is locked until previous section is approved.");
        }
        const root = this.getSectionRootUri(projectId, section);
        const targetDir = relativeDir ? vscode.Uri.joinPath(root, relativeDir) : root;
        await this.ensureDir(targetDir);
        const safeName = this.toSectionFileName(section, pageName);
        const pageUri = vscode.Uri.joinPath(targetDir, safeName);
        const title = toTitle(safeName);
        await this.writeFile(pageUri, this.getNewFileTemplate(section, safeName, title));
        const relativePath = path.posix.relative(root.path, pageUri.path);
        await this.syncSectionIndex(projectId, section, { [relativePath]: description?.trim() || `${title}` });
        await this.setProjectUpdated(projectId);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} file created: ${safeName}`);
        return pageUri;
    }
    async createSectionFolder(projectId, section, relativeDir, folderName) {
        const editable = await this.isSectionEditable(projectId, section);
        if (!editable) {
            throw new Error("Section is locked until previous section is approved.");
        }
        const root = this.getSectionRootUri(projectId, section);
        const targetDir = relativeDir ? vscode.Uri.joinPath(root, relativeDir) : root;
        await this.ensureDir(targetDir);
        const safeName = slugify(folderName) || "new-folder";
        const folderUri = vscode.Uri.joinPath(targetDir, safeName);
        await this.ensureDir(folderUri);
        await this.syncSectionIndex(projectId, section);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} folder created: ${safeName}`);
        return folderUri;
    }
    async renameItem(projectId, section, itemUri, newName) {
        const editable = await this.isSectionEditable(projectId, section);
        if (!editable) {
            throw new Error("Section is locked. Approve the previous section first.");
        }
        const safeNewName = this.toRenamedItemName(section, itemUri, newName);
        const parentPath = path.posix.dirname(itemUri.path);
        const newUri = itemUri.with({ path: `${parentPath}/${safeNewName}` });
        await vscode.workspace.fs.rename(itemUri, newUri, { overwrite: false });
        // Update approvals if it's a file
        if (this.isSupportedSectionFilePath(section, itemUri.path)) {
            const sectionRoot = this.getSectionRootUri(projectId, section);
            const oldRelative = path.posix.relative(sectionRoot.path, itemUri.path);
            const newRelative = path.posix.relative(sectionRoot.path, newUri.path);
            const approvals = await this.readApprovals(projectId, section);
            if (approvals[oldRelative]) {
                approvals[newRelative] = approvals[oldRelative];
                delete approvals[oldRelative];
                await this.writeJson(this.getSectionApprovalsUri(projectId, section), approvals);
            }
            const descriptions = await this.readSectionIndexDescriptions(projectId, section);
            if (descriptions[oldRelative]) {
                descriptions[newRelative] = descriptions[oldRelative];
                delete descriptions[oldRelative];
            }
            await this.syncSectionIndex(projectId, section, descriptions);
        }
        else {
            await this.syncSectionIndex(projectId, section);
        }
        await this.setProjectUpdated(projectId);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} item renamed to: ${safeNewName}`);
    }
    async deleteItem(projectId, section, itemUri, isDirectory) {
        const editable = await this.isSectionEditable(projectId, section);
        if (!editable) {
            throw new Error("Section is locked. Approve the previous section first.");
        }
        await vscode.workspace.fs.delete(itemUri, { recursive: isDirectory, useTrash: true });
        // Clean up approvals
        const sectionRoot = this.getSectionRootUri(projectId, section);
        const approvals = await this.readApprovals(projectId, section);
        const itemRelative = path.posix.relative(sectionRoot.path, itemUri.path);
        let changed = false;
        for (const key of Object.keys(approvals)) {
            if (key === itemRelative || key.startsWith(`${itemRelative}/`)) {
                delete approvals[key];
                changed = true;
            }
        }
        if (changed) {
            await this.writeJson(this.getSectionApprovalsUri(projectId, section), approvals);
        }
        await this.syncSectionIndex(projectId, section);
        await this.setProjectUpdated(projectId);
        const label = path.posix.basename(itemUri.path);
        await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} item deleted: ${label}`);
    }
    async appendBuildManualChangeLog(projectId, message) {
        const logUri = this.getBuildManualLogUri(projectId);
        const ts = nowIso();
        const line = `- ${ts} - ${message}`;
        const existing = await this.readFile(logUri);
        const content = existing
            ? `${existing.trimEnd()}\n${line}\n`
            : `# Build Manual Change Log\n\nTracks manual edit/delete actions in the Build section.\n\n${line}\n`;
        await this.writeFile(logUri, content);
    }
    async appendActivity(projectId, message) {
        const activityUri = vscode.Uri.joinPath(this.getProjectRootUri(projectId), "activity.jsonl");
        const line = JSON.stringify({ ts: nowIso(), message }) + "\n";
        const existing = await this.readFile(activityUri);
        const content = existing ? `${existing}${line}` : line;
        await this.writeFile(activityUri, content);
    }
    async listSectionEntries(projectId, section, dirUri) {
        const root = dirUri ?? this.getSectionRootUri(projectId, section);
        await this.ensureDir(root);
        const entries = await vscode.workspace.fs.readDirectory(root);
        return entries
            .map(([name, type]) => ({ uri: vscode.Uri.joinPath(root, name), type }))
            .sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === vscode.FileType.Directory ? -1 : 1;
            }
            return path.basename(a.uri.path).localeCompare(path.basename(b.uri.path));
        });
    }
    async isFileApproved(projectId, section, fileUri) {
        if (!this.isSupportedSectionFilePath(section, fileUri.path)) {
            return false;
        }
        const sectionRoot = this.getSectionRootUri(projectId, section);
        const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
        if (!relativePath || relativePath.startsWith("..")) {
            return false;
        }
        const approvals = await this.readApprovals(projectId, section);
        return Boolean(approvals[relativePath]);
    }
    getRelativePathInSection(projectId, section, itemUri) {
        const root = this.getSectionRootUri(projectId, section);
        const rel = path.posix.relative(root.path, itemUri.path);
        return rel === "." ? "" : rel;
    }
    getSectionDefinition(section) {
        return models_1.SECTIONS.find((s) => s.key === section);
    }
    sectionHasGate(section) {
        return this.getSectionDefinition(section).hasGate;
    }
    getSupportedFileExtensions(section) {
        return this.getSectionDefinition(section).supportedFileExtensions;
    }
    getDefaultFileExtension(section) {
        return this.getSectionDefinition(section).defaultFileExtension;
    }
    isSupportedSectionFilePath(section, filePath) {
        const lowered = filePath.toLowerCase();
        return this.getSupportedFileExtensions(section).some((ext) => lowered.endsWith(ext));
    }
    toSectionFileName(section, inputName) {
        const normalized = inputName.trim().toLowerCase();
        const supportedExts = this.getSupportedFileExtensions(section);
        const explicitExt = supportedExts.find((ext) => normalized.endsWith(ext));
        const ext = explicitExt ?? this.getDefaultFileExtension(section);
        const baseRaw = explicitExt ? inputName.trim().slice(0, -explicitExt.length) : inputName.trim();
        const base = slugify(baseRaw) || "new-page";
        return `${base}${ext}`;
    }
    toRenamedItemName(section, itemUri, newName) {
        const currentBase = path.posix.basename(itemUri.path).toLowerCase();
        const isSupportedFile = this.isSupportedSectionFilePath(section, currentBase);
        if (!isSupportedFile) {
            return slugify(newName) || "renamed";
        }
        return this.toSectionFileName(section, newName);
    }
    async listAllSectionFileRelativePaths(projectId, section) {
        const root = this.getSectionRootUri(projectId, section);
        const output = [];
        const walk = async (dirUri) => {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [name, type] of entries) {
                const child = vscode.Uri.joinPath(dirUri, name);
                if (type === vscode.FileType.Directory) {
                    await walk(child);
                    continue;
                }
                if (type === vscode.FileType.File && this.isSupportedSectionFilePath(section, name)) {
                    const relativePath = path.posix.relative(root.path, child.path);
                    if (relativePath.toLowerCase() === "index.md" || (section === "build" && relativePath.toLowerCase() === BUILD_MANUAL_LOG_FILE)) {
                        continue;
                    }
                    output.push(relativePath);
                }
            }
        };
        await walk(root);
        return output;
    }
    async autoApproveAllFilesInSection(projectId, section) {
        const files = await this.listAllSectionFileRelativePaths(projectId, section);
        if (files.length === 0) {
            return;
        }
        const approvals = {};
        for (const relativePath of files) {
            approvals[relativePath] = { approvedAt: nowIso(), comment: "Auto-approved on import" };
        }
        await this.writeJson(this.getSectionApprovalsUri(projectId, section), approvals);
    }
    async readApprovals(projectId, section) {
        const approvals = await this.readJson(this.getSectionApprovalsUri(projectId, section));
        return approvals ?? {};
    }
    async ensureDir(uri) {
        await vscode.workspace.fs.createDirectory(uri);
    }
    async readJson(uri) {
        const content = await this.readFile(uri);
        if (!content) {
            return null;
        }
        try {
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async writeJson(uri, value) {
        const json = JSON.stringify(value, null, 2) + "\n";
        await this.writeFile(uri, json);
    }
    async readFile(uri) {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return decoder.decode(bytes);
        }
        catch {
            return null;
        }
    }
    async writeFile(uri, content) {
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
    }
    buildDefaultSectionStates() {
        const firstGatedSection = models_1.SECTIONS.find((section) => section.hasGate)?.key;
        return models_1.SECTIONS.map((section) => ({
            section: section.key,
            status: !section.hasGate ? "APPROVED" : section.key === firstGatedSection ? "PENDING_REVIEW" : "LOCKED",
            approvedAt: null,
            comment: null,
            updatedAt: nowIso()
        }));
    }
    getStarterContent(section, fileName) {
        const ext = path.posix.extname(fileName).toLowerCase();
        if (section === "readyToBuild") {
            return "# Ready to Build\n\n> This section is auto-generated by Copilot once Engineering Plan is approved.\n";
        }
        if (ext === ".html") {
            return [
                "<!doctype html>",
                "<html lang=\"en\">",
                "<head>",
                "  <meta charset=\"UTF-8\" />",
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
                "  <title>Overview</title>",
                "</head>",
                "<body>",
                "  <h1>Overview</h1>",
                "</body>",
                "</html>",
                ""
            ].join("\n");
        }
        if (ext === ".puml") {
            return ["@startuml", "title Overview", "@enduml", ""].join("\n");
        }
        return `# ${this.getSectionDefinition(section).label} Overview\n\n`;
    }
    getNewFileTemplate(section, fileName, title) {
        const ext = path.posix.extname(fileName).toLowerCase();
        if (ext === ".html") {
            return [
                "<!doctype html>",
                "<html lang=\"en\">",
                "<head>",
                "  <meta charset=\"UTF-8\" />",
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
                `  <title>${title}</title>`,
                "</head>",
                "<body>",
                `  <h1>${title}</h1>`,
                "</body>",
                "</html>",
                ""
            ].join("\n");
        }
        if (ext === ".puml") {
            return ["@startuml", `title ${title}`, "@enduml", ""].join("\n");
        }
        if (section === "knowledgeBase") {
            return `# ${title}\n\n`;
        }
        return `# ${title}\n\n`;
    }
    async readSectionIndexDescriptions(projectId, section) {
        const indexUri = this.getSectionIndexUri(projectId, section);
        const content = await this.readFile(indexUri);
        if (!content) {
            return {};
        }
        const descriptions = {};
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            const match = line.match(/^- \[[^\]]+\]\(\.\/([^\)]+)\)(?: - (.*))?$/);
            if (!match) {
                continue;
            }
            const filePath = match[1].trim();
            const description = (match[2] ?? "").trim();
            if (filePath && filePath.toLowerCase() !== "index.md") {
                descriptions[filePath] = description;
            }
        }
        return descriptions;
    }
    async syncSectionIndex(projectId, section, overrides = {}) {
        const sectionRoot = this.getSectionRootUri(projectId, section);
        await this.ensureDir(sectionRoot);
        const files = (await this.listAllSectionFileRelativePaths(projectId, section)).sort((a, b) => a.localeCompare(b));
        const existing = await this.readSectionIndexDescriptions(projectId, section);
        const descriptions = { ...existing, ...overrides };
        const lines = [];
        lines.push(`# ${this.getSectionDefinition(section).label} Index`);
        lines.push("");
        lines.push(`Auto-generated index of ${this.getSectionDefinition(section).label} files.`);
        lines.push("");
        if (files.length === 0) {
            lines.push("_No files yet._");
        }
        else {
            for (const file of files) {
                const desc = descriptions[file]?.trim();
                lines.push(desc ? `- [${file}](./${file}) - ${desc}` : `- [${file}](./${file})`);
            }
        }
        lines.push("");
        await this.writeFile(this.getSectionIndexUri(projectId, section), lines.join("\n"));
    }
    async deleteIfExists(uri) {
        try {
            await vscode.workspace.fs.stat(uri);
        }
        catch {
            return;
        }
        await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
    }
    async copyDirectoryContents(fromDir, toDir) {
        const entries = await vscode.workspace.fs.readDirectory(fromDir);
        for (const [name, type] of entries) {
            const source = vscode.Uri.joinPath(fromDir, name);
            const target = vscode.Uri.joinPath(toDir, name);
            if (type === vscode.FileType.Directory) {
                await this.ensureDir(target);
                await this.copyDirectoryContents(source, target);
                continue;
            }
            if (type === vscode.FileType.File) {
                const bytes = await vscode.workspace.fs.readFile(source);
                await vscode.workspace.fs.writeFile(target, bytes);
            }
        }
    }
}
exports.ScaffoldStorage = ScaffoldStorage;
//# sourceMappingURL=storage.js.map