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
exports.SectionTreeProvider = exports.SectionNodeItem = exports.SectionProgressItem = void 0;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
class SectionProgressItem extends vscode.TreeItem {
    section;
    constructor(section, label, finalized, total, accessible) {
        super(`${label} Progress`, vscode.TreeItemCollapsibleState.None);
        this.section = section;
        this.id = `section-progress:${section}`;
        if (!accessible) {
            this.description = "locked · finalize a file in the previous section to unlock";
            this.iconPath = new vscode.ThemeIcon("lock");
            this.contextValue = "section.progress.locked";
        }
        else if (total === 0) {
            this.description = "no files yet";
            this.iconPath = new vscode.ThemeIcon("circle-outline");
            this.contextValue = "section.progress.empty";
        }
        else {
            this.description = `${finalized} / ${total} finalized`;
            this.iconPath = new vscode.ThemeIcon(finalized > 0 && finalized === total ? "check-all" : "circle-large-outline");
            this.contextValue = "section.progress.active";
        }
    }
}
exports.SectionProgressItem = SectionProgressItem;
class SectionNodeItem extends vscode.TreeItem {
    uri;
    section;
    isDirectory;
    constructor(uri, section, isDirectory, finalized) {
        super(path.basename(uri.path), isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.uri = uri;
        this.section = section;
        this.isDirectory = isDirectory;
        this.resourceUri = uri;
        if (isDirectory) {
            this.contextValue = "section.folder";
            this.iconPath = new vscode.ThemeIcon("folder");
            return;
        }
        this.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [uri]
        };
        if (finalized) {
            this.description = "finalized";
            this.contextValue = "section.file.finalized";
            this.iconPath = new vscode.ThemeIcon("lock");
        }
        else {
            this.description = "editing";
            this.contextValue = "section.file.editing";
            this.iconPath = new vscode.ThemeIcon("edit");
        }
    }
}
exports.SectionNodeItem = SectionNodeItem;
class SectionTreeProvider {
    storage;
    section;
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    constructor(storage, section) {
        this.storage = storage;
        this.section = section;
    }
    refresh() {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            const accessible = await this.storage.isSectionAccessible(this.section);
            const progress = await this.storage.getSectionProgress(this.section);
            const def = this.storage.getSectionDefinition(this.section);
            const progressItem = new SectionProgressItem(this.section, def.label, progress.finalized, progress.total, accessible);
            const rootEntries = accessible ? await this.toNodeItems(this.section) : [];
            return [progressItem, ...rootEntries];
        }
        if (element instanceof SectionNodeItem && element.isDirectory) {
            return this.toNodeItems(this.section, element.uri);
        }
        return [];
    }
    async toNodeItems(section, dirUri) {
        const entries = await this.storage.listSectionEntries(section, dirUri);
        const mapped = [];
        for (const entry of entries) {
            const isDirectory = entry.type === vscode.FileType.Directory;
            if (!isDirectory) {
                const fileName = path.posix.basename(entry.uri.path).toLowerCase();
                if (fileName === "index.md" || fileName === "backlog.md") {
                    continue;
                }
                if (!this.storage.isSupportedSectionFilePath(section, entry.uri.path)) {
                    continue;
                }
            }
            const finalized = isDirectory ? false : await this.storage.isFileFinalized(section, entry.uri);
            mapped.push(new SectionNodeItem(entry.uri, section, isDirectory, finalized));
        }
        return mapped;
    }
}
exports.SectionTreeProvider = SectionTreeProvider;
//# sourceMappingURL=sectionTreeProvider.js.map