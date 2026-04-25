import * as path from "node:path";
import * as vscode from "vscode";
import {
  ScaffoldConfig,
  FileStateMap,
  SectionKey,
  SECTIONS
} from "./models";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TASK_BACKLOG_FILE = "backlog.md";

// Sections that are always accessible without requiring previous section progress
const ALWAYS_ACCESSIBLE: SectionKey[] = ["knowledgeBase", "prd"];

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toTitle(value: string): string {
  const base = value.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!base) {
    return "New File";
  }
  return base
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class ScaffoldStorage {
  private readonly workspaceFolder: vscode.WorkspaceFolder;

  public constructor(workspaceFolder: vscode.WorkspaceFolder) {
    this.workspaceFolder = workspaceFolder;
  }

  public getConfig(): ScaffoldConfig {
    const cfg = vscode.workspace.getConfiguration("scaffold", this.workspaceFolder.uri);
    const dataFolder = cfg.get<string>("dataFolder", ".scaffold");
    return { dataFolder };
  }

  public getDataRootUri(): vscode.Uri {
    const { dataFolder } = this.getConfig();
    return vscode.Uri.joinPath(this.workspaceFolder.uri, dataFolder);
  }

  public getSectionsRootUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getDataRootUri(), "sections");
  }

  /**
   * Returns the workspace path for section content files.
   * All planning sections live under .scaffold/sections.
   */
  public getSectionRootUri(section: SectionKey): vscode.Uri {
    const def = this.getSectionDefinition(section);
    return vscode.Uri.joinPath(this.getSectionsRootUri(), def.folderName);
  }

  public getSectionIndexUri(section: SectionKey): vscode.Uri {
    return vscode.Uri.joinPath(this.getSectionRootUri(section), "index.md");
  }

  public getSectionStatesUri(section: SectionKey): vscode.Uri {
    return vscode.Uri.joinPath(this.getDataRootUri(), ".states", `${section}.json`);
  }

  public getTaskBacklogUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getSectionRootUri("readyToBuild"), TASK_BACKLOG_FILE);
  }

  public async isInitialized(): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(this.getDataRootUri());
      return true;
    } catch {
      return false;
    }
  }

  public async initialize(): Promise<void> {
    const dataRoot = this.getDataRootUri();
    const statesDir = vscode.Uri.joinPath(dataRoot, ".states");

    await this.ensureDir(dataRoot);
    await this.ensureDir(statesDir);
    await this.ensureDir(this.getSectionsRootUri());

    for (const section of SECTIONS) {
      await this.ensureDir(this.getSectionRootUri(section.key));

      const statesUri = this.getSectionStatesUri(section.key);
      if (!(await this.readFile(statesUri))) {
        await this.writeJson(statesUri, {});
      }

      const sectionRoot = this.getSectionRootUri(section.key);
      const overviewFile = `overview${this.getDefaultFileExtension(section.key)}`;
      const starter = vscode.Uri.joinPath(sectionRoot, overviewFile);
      if (!(await this.readFile(starter))) {
        await this.writeFile(starter, this.getStarterContent(section.key, overviewFile));
        const states = await this.getFileStates(section.key);
        states[overviewFile] = { status: "editing" };
        await this.writeJson(this.getSectionStatesUri(section.key), states);
        await this.syncSectionIndex(section.key, { [overviewFile]: `${section.label} overview` });
      } else {
        await this.syncSectionIndex(section.key);
      }
    }

    await this.syncTaskBacklog();
    await this.appendActivity("Workspace initialized.");
  }

  public async getFileStates(section: SectionKey): Promise<FileStateMap> {
    const states = await this.readJson<FileStateMap>(this.getSectionStatesUri(section));
    return states ?? {};
  }

  public async isFileFinalized(section: SectionKey, fileUri: vscode.Uri): Promise<boolean> {
    if (!this.isSupportedSectionFilePath(section, fileUri.path)) {
      return false;
    }
    const sectionRoot = this.getSectionRootUri(section);
    const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
    if (!relativePath || relativePath.startsWith("..")) {
      return false;
    }
    const states = await this.getFileStates(section);
    return states[relativePath]?.status === "finalized";
  }

  public async finalizeFile(section: SectionKey, fileUri: vscode.Uri): Promise<void> {
    if (!this.isSupportedSectionFilePath(section, fileUri.path)) {
      throw new Error("Only supported files can be finalized.");
    }
    const sectionRoot = this.getSectionRootUri(section);
    const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
    if (!relativePath || relativePath.startsWith("..")) {
      throw new Error("File is outside section root.");
    }
    const states = await this.getFileStates(section);
    states[relativePath] = { status: "finalized", finalizedAt: nowIso() };
    await this.writeJson(this.getSectionStatesUri(section), states);
    await this.syncSectionIndex(section);
    await this.appendActivity(`${this.getSectionDefinition(section).label} file finalized: ${relativePath}`);
  }

  public async createFileRevision(section: SectionKey, fileUri: vscode.Uri): Promise<vscode.Uri> {
    if (!this.isSupportedSectionFilePath(section, fileUri.path)) {
      throw new Error("Only supported files can have revisions created.");
    }
    const sectionRoot = this.getSectionRootUri(section);
    const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
    if (!relativePath || relativePath.startsWith("..")) {
      throw new Error("File is outside section root.");
    }

    const ext = path.posix.extname(fileUri.path);
    const baseName = path.posix.basename(fileUri.path, ext);
    const parentPath = path.posix.dirname(fileUri.path);
    const parentUri = fileUri.with({ path: parentPath });

    // Extract core base name, stripping any existing _v{n} suffix
    const versionMatch = baseName.match(/^(.+?)_v(\d+)$/);
    const coreBase = versionMatch ? versionMatch[1] : baseName;

    // Find next available version number
    let version = 2;
    let candidateUri: vscode.Uri;
    while (true) {
      const candidateName = `${coreBase}_v${version}${ext}`;
      candidateUri = vscode.Uri.joinPath(parentUri, candidateName);
      try {
        await vscode.workspace.fs.stat(candidateUri);
        version++;
      } catch {
        break;
      }
    }

    const originalContent = await this.readFile(fileUri) ?? "";
    await this.writeFile(candidateUri, originalContent);

    const newRelativePath = path.posix.relative(sectionRoot.path, candidateUri.path);
    const states = await this.getFileStates(section);
    states[newRelativePath] = { status: "editing" };
    await this.writeJson(this.getSectionStatesUri(section), states);

    await this.syncSectionIndex(section);
    if (this.getSectionDefinition(section).isBacklogSection) {
      await this.syncTaskBacklog();
    }
    await this.appendActivity(`${this.getSectionDefinition(section).label} file revision created: ${newRelativePath}`);
    return candidateUri;
  }

  public async getSectionProgress(section: SectionKey): Promise<{ finalized: number; total: number }> {
    const states = await this.getFileStates(section);
    const entries = Object.values(states);
    const finalized = entries.filter((e) => e.status === "finalized").length;
    return { finalized, total: entries.length };
  }

  public async isSectionAccessible(section: SectionKey): Promise<boolean> {
    if (ALWAYS_ACCESSIBLE.includes(section)) {
      return true;
    }
    const sectionIndex = SECTIONS.findIndex((s) => s.key === section);
    if (sectionIndex <= 0) {
      return true;
    }
    const previousSection = SECTIONS[sectionIndex - 1].key;
    const progress = await this.getSectionProgress(previousSection);
    return progress.finalized >= 1;
  }

  public async syncTaskBacklog(): Promise<void> {
    const backlogUri = this.getTaskBacklogUri();
    const files = (await this.listAllSectionFileRelativePaths("readyToBuild")).sort((a, b) => a.localeCompare(b));

    // Preserve existing done markers
    const existingDone = new Set<string>();
    const existingContent = await this.readFile(backlogUri);
    if (existingContent) {
      for (const line of existingContent.split(/\r?\n/)) {
        const match = line.match(/^- \[x\] \[([^\]]+)\]/);
        if (match) {
          existingDone.add(match[1]);
        }
      }
    }

    const descriptions = await this.readSectionIndexDescriptions("readyToBuild");
    const lines: string[] = [];
    lines.push("# Task Plan Backlog");
    lines.push("");
    lines.push("Track task completion. Check off tasks as they are implemented.");
    lines.push("");

    if (files.length === 0) {
      lines.push("_No tasks yet._");
    } else {
      for (const file of files) {
        const done = existingDone.has(file);
        const desc = descriptions[file]?.trim();
        const check = done ? "[x]" : "[ ]";
        lines.push(desc ? `- ${check} [${file}](./${file}) - ${desc}` : `- ${check} [${file}](./${file})`);
      }
    }

    lines.push("");
    await this.writeFile(backlogUri, lines.join("\n"));
  }

  public async markTaskDone(section: SectionKey, fileUri: vscode.Uri): Promise<void> {
    const sectionRoot = this.getSectionRootUri(section);
    const relativePath = path.posix.relative(sectionRoot.path, fileUri.path);
    const backlogUri = this.getTaskBacklogUri();
    const content = await this.readFile(backlogUri);
    if (!content) {
      return;
    }
    const updated = content.replace(
      new RegExp(`(- )\\[ \\] (\\[${escapeRegExp(relativePath)}\\])`, "g"),
      "$1[x] $2"
    );
    if (updated !== content) {
      await this.writeFile(backlogUri, updated);
      await this.appendActivity(`Task marked done: ${relativePath}`);
    }
  }

  public async createSectionFile(
    section: SectionKey,
    relativeDir: string,
    pageName: string,
    description?: string | null
  ): Promise<vscode.Uri> {
    const accessible = await this.isSectionAccessible(section);
    if (!accessible) {
      throw new Error("Section is not yet accessible. Finalize at least one file in the previous section first.");
    }

    const root = this.getSectionRootUri(section);
    const targetDir = relativeDir ? vscode.Uri.joinPath(root, relativeDir) : root;
    await this.ensureDir(targetDir);

    const safeName = this.toSectionFileName(section, pageName);
    const pageUri = vscode.Uri.joinPath(targetDir, safeName);
    const title = toTitle(safeName);

    await this.writeFile(pageUri, this.getNewFileTemplate(section, safeName, title));
    const relativePath = path.posix.relative(root.path, pageUri.path);

    const states = await this.getFileStates(section);
    states[relativePath] = { status: "editing" };
    await this.writeJson(this.getSectionStatesUri(section), states);

    await this.syncSectionIndex(section, { [relativePath]: description?.trim() || `${title}` });
    if (this.getSectionDefinition(section).isBacklogSection) {
      await this.syncTaskBacklog();
    }
    await this.appendActivity(`${this.getSectionDefinition(section).label} file created: ${safeName}`);
    return pageUri;
  }

  public async createSectionFolder(
    section: SectionKey,
    relativeDir: string,
    folderName: string
  ): Promise<vscode.Uri> {
    const accessible = await this.isSectionAccessible(section);
    if (!accessible) {
      throw new Error("Section is not yet accessible. Finalize at least one file in the previous section first.");
    }

    const root = this.getSectionRootUri(section);
    const targetDir = relativeDir ? vscode.Uri.joinPath(root, relativeDir) : root;
    await this.ensureDir(targetDir);

    const safeName = slugify(folderName) || "new-folder";
    const folderUri = vscode.Uri.joinPath(targetDir, safeName);
    await this.ensureDir(folderUri);
    await this.syncSectionIndex(section);
    await this.appendActivity(`${this.getSectionDefinition(section).label} folder created: ${safeName}`);
    return folderUri;
  }

  public async renameItem(
    section: SectionKey,
    itemUri: vscode.Uri,
    newName: string
  ): Promise<void> {
    const safeNewName = this.toRenamedItemName(section, itemUri, newName);
    const parentPath = path.posix.dirname(itemUri.path);
    const newUri = itemUri.with({ path: `${parentPath}/${safeNewName}` });

    await vscode.workspace.fs.rename(itemUri, newUri, { overwrite: false });

    if (this.isSupportedSectionFilePath(section, itemUri.path)) {
      const sectionRoot = this.getSectionRootUri(section);
      const oldRelative = path.posix.relative(sectionRoot.path, itemUri.path);
      const newRelative = path.posix.relative(sectionRoot.path, newUri.path);

      const states = await this.getFileStates(section);
      if (states[oldRelative]) {
        states[newRelative] = states[oldRelative];
        delete states[oldRelative];
        await this.writeJson(this.getSectionStatesUri(section), states);
      }

      const descriptions = await this.readSectionIndexDescriptions(section);
      if (descriptions[oldRelative]) {
        descriptions[newRelative] = descriptions[oldRelative];
        delete descriptions[oldRelative];
      }
      await this.syncSectionIndex(section, descriptions);
    } else {
      await this.syncSectionIndex(section);
    }

    if (this.getSectionDefinition(section).isBacklogSection) {
      await this.syncTaskBacklog();
    }
    await this.appendActivity(`${this.getSectionDefinition(section).label} item renamed to: ${safeNewName}`);
  }

  public async deleteItem(
    section: SectionKey,
    itemUri: vscode.Uri,
    isDirectory: boolean
  ): Promise<void> {
    await vscode.workspace.fs.delete(itemUri, { recursive: isDirectory, useTrash: true });

    const sectionRoot = this.getSectionRootUri(section);
    const states = await this.getFileStates(section);
    const itemRelative = path.posix.relative(sectionRoot.path, itemUri.path);

    let changed = false;
    for (const key of Object.keys(states)) {
      if (key === itemRelative || key.startsWith(`${itemRelative}/`)) {
        delete states[key];
        changed = true;
      }
    }

    if (changed) {
      await this.writeJson(this.getSectionStatesUri(section), states);
    }

    await this.syncSectionIndex(section);

    if (this.getSectionDefinition(section).isBacklogSection) {
      await this.syncTaskBacklog();
    }

    const label = path.posix.basename(itemUri.path);
    await this.appendActivity(`${this.getSectionDefinition(section).label} item deleted: ${label}`);
  }

  public async appendActivity(message: string): Promise<void> {
    const activityUri = vscode.Uri.joinPath(this.getDataRootUri(), "activity.jsonl");
    const line = JSON.stringify({ ts: nowIso(), message }) + "\n";

    const existing = await this.readFile(activityUri);
    const content = existing ? `${existing}${line}` : line;
    await this.writeFile(activityUri, content);
  }

  public async listSectionEntries(
    section: SectionKey,
    dirUri?: vscode.Uri
  ): Promise<Array<{ uri: vscode.Uri; type: vscode.FileType }>> {
    const root = dirUri ?? this.getSectionRootUri(section);
    await this.ensureDir(root);
    const entries = await vscode.workspace.fs.readDirectory(root);
    const hiddenFolderName = this.getConfig().dataFolder;

    return entries
      .map(([name, type]) => ({ uri: vscode.Uri.joinPath(root, name), type }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === vscode.FileType.Directory ? -1 : 1;
        }
        return path.basename(a.uri.path).localeCompare(path.basename(b.uri.path));
      });
  }

  public getRelativePathInSection(section: SectionKey, itemUri: vscode.Uri): string {
    const root = this.getSectionRootUri(section);
    const rel = path.posix.relative(root.path, itemUri.path);
    return rel === "." ? "" : rel;
  }

  public getSectionDefinition(section: SectionKey) {
    return SECTIONS.find((s) => s.key === section) as (typeof SECTIONS)[number];
  }

  public getSupportedFileExtensions(section: SectionKey): string[] {
    return this.getSectionDefinition(section).supportedFileExtensions;
  }

  public getDefaultFileExtension(section: SectionKey): string {
    return this.getSectionDefinition(section).defaultFileExtension;
  }

  public isSupportedSectionFilePath(section: SectionKey, filePath: string): boolean {
    const lowered = filePath.toLowerCase();
    return this.getSupportedFileExtensions(section).some((ext) => lowered.endsWith(ext));
  }

  private toSectionFileName(section: SectionKey, inputName: string): string {
    const normalized = inputName.trim().toLowerCase();
    const supportedExts = this.getSupportedFileExtensions(section);
    const explicitExt = supportedExts.find((ext) => normalized.endsWith(ext));
    const ext = explicitExt ?? this.getDefaultFileExtension(section);

    const baseRaw = explicitExt ? inputName.trim().slice(0, -explicitExt.length) : inputName.trim();
    const base = slugify(baseRaw) || "new-page";
    return `${base}${ext}`;
  }

  private toRenamedItemName(section: SectionKey, itemUri: vscode.Uri, newName: string): string {
    const currentBase = path.posix.basename(itemUri.path).toLowerCase();
    const isSupportedFile = this.isSupportedSectionFilePath(section, currentBase);
    if (!isSupportedFile) {
      return slugify(newName) || "renamed";
    }
    return this.toSectionFileName(section, newName);
  }

  private async listAllSectionFileRelativePaths(section: SectionKey): Promise<string[]> {
    const root = this.getSectionRootUri(section);
    const output: string[] = [];
    const hiddenFolderName = this.getConfig().dataFolder;

    const walk = async (dirUri: vscode.Uri): Promise<void> => {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const child = vscode.Uri.joinPath(dirUri, name);
        if (type === vscode.FileType.Directory) {
          await walk(child);
          continue;
        }
        if (type === vscode.FileType.File && this.isSupportedSectionFilePath(section, name)) {
          const relativePath = path.posix.relative(root.path, child.path);
          const lowerRelative = relativePath.toLowerCase();
          if (lowerRelative === "index.md") {
            continue;
          }
          if (section === "readyToBuild" && lowerRelative === TASK_BACKLOG_FILE) {
            continue;
          }
          output.push(relativePath);
        }
      }
    };

    await walk(root);
    return output;
  }

  private async ensureDir(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(uri);
  }

  private async readJson<T>(uri: vscode.Uri): Promise<T | null> {
    const content = await this.readFile(uri);
    if (!content) {
      return null;
    }
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
    const json = JSON.stringify(value, null, 2) + "\n";
    await this.writeFile(uri, json);
  }

  private async readFile(uri: vscode.Uri): Promise<string | null> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return decoder.decode(bytes);
    } catch {
      return null;
    }
  }

  private async writeFile(uri: vscode.Uri, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
  }

  private getStarterContent(section: SectionKey, fileName: string): string {
    const ext = path.posix.extname(fileName).toLowerCase();

    if (section === "readyToBuild") {
      return "# Task Plan\n\n> Add task files to this section. Use the Generate Task Plan Prompt to have Copilot create tasks from your Engineering Plan.\n";
    }

    if (ext === ".html") {
      return [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
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

  private getNewFileTemplate(section: SectionKey, fileName: string, title: string): string {
    const ext = path.posix.extname(fileName).toLowerCase();

    if (ext === ".html") {
      return [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
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

    return `# ${title}\n\n`;
  }

  private async readSectionIndexDescriptions(section: SectionKey): Promise<Record<string, string>> {
    const indexUri = this.getSectionIndexUri(section);
    const content = await this.readFile(indexUri);
    if (!content) {
      return {};
    }

    const descriptions: Record<string, string> = {};
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

  public async syncSectionIndex(
    section: SectionKey,
    overrides: Record<string, string> = {}
  ): Promise<void> {
    const sectionRoot = this.getSectionRootUri(section);
    await this.ensureDir(sectionRoot);

    const files = (await this.listAllSectionFileRelativePaths(section)).sort((a, b) => a.localeCompare(b));
    const existing = await this.readSectionIndexDescriptions(section);
    const descriptions = { ...existing, ...overrides };

    const lines: string[] = [];
    lines.push(`# ${this.getSectionDefinition(section).label} Index`);
    lines.push("");
    lines.push(`Auto-generated index of ${this.getSectionDefinition(section).label} files.`);
    lines.push("");

    if (files.length === 0) {
      lines.push("_No files yet._");
    } else {
      for (const file of files) {
        const desc = descriptions[file]?.trim();
        lines.push(desc ? `- [${file}](./${file}) - ${desc}` : `- [${file}](./${file})`);
      }
    }

    lines.push("");
    await this.writeFile(this.getSectionIndexUri(section), lines.join("\n"));
  }
}
