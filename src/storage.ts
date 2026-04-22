import * as path from "node:path";
import * as vscode from "vscode";
import {
  ScaffoldConfig,
  FileApprovals,
  ProjectMeta,
  SectionKey,
  SectionState,
  SectionStatus,
  SECTIONS
} from "./models";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BUILD_MANUAL_LOG_FILE = "manual-change-log.md";

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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

export class ScaffoldStorage {
  private readonly workspaceFolder: vscode.WorkspaceFolder;

  public constructor(workspaceFolder: vscode.WorkspaceFolder) {
    this.workspaceFolder = workspaceFolder;
  }

  public getConfig(): ScaffoldConfig {
    const cfg = vscode.workspace.getConfiguration("scaffold", this.workspaceFolder.uri);
    const dataFolder = cfg.get<string>("dataFolder", ".scaffold");
    const gateMode = cfg.get<"strict" | "flexible">("gateMode", "strict");
    return { dataFolder, gateMode };
  }

  public getDataRootUri(): vscode.Uri {
    const { dataFolder } = this.getConfig();
    return vscode.Uri.joinPath(this.workspaceFolder.uri, dataFolder);
  }

  public getProjectsRootUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getDataRootUri(), "projects");
  }

  public async initialize(): Promise<void> {
    await this.ensureDir(this.getProjectsRootUri());
  }

  public async listProjects(): Promise<ProjectMeta[]> {
    const projectsRoot = this.getProjectsRootUri();
    await this.ensureDir(projectsRoot);
    const entries = await vscode.workspace.fs.readDirectory(projectsRoot);

    const projects: ProjectMeta[] = [];
    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.Directory) {
        continue;
      }
      const metaUri = vscode.Uri.joinPath(projectsRoot, name, ".meta.json");
      const meta = await this.readJson<ProjectMeta>(metaUri);
      if (meta) {
        projects.push(meta);
      }
    }

    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public getProjectRootUri(projectId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.getProjectsRootUri(), projectId);
  }

  public getProjectMetaUri(projectId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.getProjectRootUri(projectId), ".meta.json");
  }

  public getSectionsStateUri(projectId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.getProjectRootUri(projectId), "sections.json");
  }

  /**
   * Returns the visible workspace-level path for section content files.
   * e.g. {workspaceRoot}/{projectId}/{sectionFolderName}/
   * Metadata (sections.json, approvals, etc.) stays in .scaffold.
   */
  public getSectionRootUri(projectId: string, section: SectionKey): vscode.Uri {
    const def = this.getSectionDefinition(section);
    return vscode.Uri.joinPath(this.workspaceFolder.uri, projectId, def.folderName);
  }

  /**
   * Returns the visible project content root: {workspaceRoot}/{projectId}/
   */
  public getProjectContentRootUri(projectId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.workspaceFolder.uri, projectId);
  }

  public getSectionApprovalsUri(projectId: string, section: SectionKey): vscode.Uri {
    return vscode.Uri.joinPath(this.getProjectRootUri(projectId), ".approvals", `${section}.json`);
  }

  public getSectionIndexUri(projectId: string, section: SectionKey): vscode.Uri {
    return vscode.Uri.joinPath(this.getSectionRootUri(projectId, section), "index.md");
  }

  public getBuildManualLogUri(projectId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.getSectionRootUri(projectId, "build"), BUILD_MANUAL_LOG_FILE);
  }

  public async createProject(name: string): Promise<ProjectMeta> {
    const baseSlug = slugify(name) || "project";
    const projectId = `${baseSlug}-${Date.now()}`;
    const root = this.getProjectRootUri(projectId);
    const approvalsDir = vscode.Uri.joinPath(root, ".approvals");

    // Metadata folder (hidden)
    await this.ensureDir(root);
    await this.ensureDir(approvalsDir);

    // Visible content folders at workspace root
    for (const section of SECTIONS) {
      await this.ensureDir(this.getSectionRootUri(projectId, section.key));
    }

    const meta: ProjectMeta = {
      id: projectId,
      name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "active"
    };

    await this.writeJson(this.getProjectMetaUri(projectId), meta);

    const states: SectionState[] = this.buildDefaultSectionStates();
    await this.writeJson(this.getSectionsStateUri(projectId), states);

    for (const section of SECTIONS) {
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

  public async deleteProject(projectId: string): Promise<void> {
    const metaRoot = this.getProjectRootUri(projectId);
    const contentRoot = this.getProjectContentRootUri(projectId);

    await this.deleteIfExists(contentRoot);
    await this.deleteIfExists(metaRoot);
  }

  public async importGeneratedOnboardingFolder(projectId: string, sourceRoot: vscode.Uri): Promise<void> {
    const sourceEntries = await vscode.workspace.fs.readDirectory(sourceRoot);
    const entryMap = new Map(sourceEntries.map(([name, type]) => [normalizeName(name), { name, type }]));

    let importedAnySection = false;

    for (const section of SECTIONS) {
      const candidates = new Set<string>([
        normalizeName(section.folderName),
        normalizeName(section.key),
        normalizeName(section.label)
      ]);

      let matched: { name: string; type: vscode.FileType } | undefined;
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

  public async getProjectMeta(projectId: string): Promise<ProjectMeta | null> {
    return this.readJson<ProjectMeta>(this.getProjectMetaUri(projectId));
  }

  public async setProjectUpdated(projectId: string): Promise<void> {
    const meta = await this.getProjectMeta(projectId);
    if (!meta) {
      return;
    }
    meta.updatedAt = nowIso();
    await this.writeJson(this.getProjectMetaUri(projectId), meta);
  }

  public async listSectionStates(projectId: string): Promise<SectionState[]> {
    const defaultStates = this.buildDefaultSectionStates();
    const states = await this.readJson<SectionState[]>(this.getSectionsStateUri(projectId));
    if (!states) {
      return defaultStates;
    }

    return SECTIONS.map((section) => {
      const fallback = defaultStates.find((state) => state.section === section.key) as SectionState;
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

  public async getSectionState(projectId: string, section: SectionKey): Promise<SectionState> {
    const states = await this.listSectionStates(projectId);
    return states.find((state) => state.section === section) as SectionState;
  }

  public async isSectionEditable(projectId: string, section: SectionKey): Promise<boolean> {
    if (!this.sectionHasGate(section)) {
      return true;
    }
    const state = await this.getSectionState(projectId, section);
    return state.status !== "LOCKED";
  }

  public async getSectionApprovalSummary(
    projectId: string,
    section: SectionKey
  ): Promise<{ totalFiles: number; approvedFiles: number; allApproved: boolean }> {
    const files = await this.listAllSectionFileRelativePaths(projectId, section);
    const approvals = await this.readApprovals(projectId, section);
    const approvedFiles = files.filter((file) => Boolean(approvals[file])).length;

    return {
      totalFiles: files.length,
      approvedFiles,
      allApproved: files.length > 0 && files.length === approvedFiles
    };
  }

  public async approveSection(projectId: string, section: SectionKey, comment: string | null): Promise<void> {
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

    const gatedSections = SECTIONS.filter((s) => s.hasGate);
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

  public async approveFile(
    projectId: string,
    section: SectionKey,
    fileUri: vscode.Uri,
    comment: string | null
  ): Promise<void> {
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

  public async unlockSection(projectId: string, section: SectionKey): Promise<void> {
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

  public async createSectionFile(
    projectId: string,
    section: SectionKey,
    relativeDir: string,
    pageName: string,
    description?: string | null
  ): Promise<vscode.Uri> {
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

  public async createSectionFolder(
    projectId: string,
    section: SectionKey,
    relativeDir: string,
    folderName: string
  ): Promise<vscode.Uri> {
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

  public async renameItem(
    projectId: string,
    section: SectionKey,
    itemUri: vscode.Uri,
    newName: string
  ): Promise<void> {
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
    } else {
      await this.syncSectionIndex(projectId, section);
    }

    await this.setProjectUpdated(projectId);
    await this.appendActivity(projectId, `${this.getSectionDefinition(section).label} item renamed to: ${safeNewName}`);
  }

  public async deleteItem(
    projectId: string,
    section: SectionKey,
    itemUri: vscode.Uri,
    isDirectory: boolean
  ): Promise<void> {
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

  public async appendBuildManualChangeLog(projectId: string, message: string): Promise<void> {
    const logUri = this.getBuildManualLogUri(projectId);
    const ts = nowIso();
    const line = `- ${ts} - ${message}`;

    const existing = await this.readFile(logUri);
    const content = existing
      ? `${existing.trimEnd()}\n${line}\n`
      : `# Build Manual Change Log\n\nTracks manual edit/delete actions in the Build section.\n\n${line}\n`;

    await this.writeFile(logUri, content);
  }

  public async appendActivity(projectId: string, message: string): Promise<void> {
    const activityUri = vscode.Uri.joinPath(this.getProjectRootUri(projectId), "activity.jsonl");
    const line = JSON.stringify({ ts: nowIso(), message }) + "\n";

    const existing = await this.readFile(activityUri);
    const content = existing ? `${existing}${line}` : line;
    await this.writeFile(activityUri, content);
  }

  public async listSectionEntries(
    projectId: string,
    section: SectionKey,
    dirUri?: vscode.Uri
  ): Promise<Array<{ uri: vscode.Uri; type: vscode.FileType }>> {
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

  public async isFileApproved(projectId: string, section: SectionKey, fileUri: vscode.Uri): Promise<boolean> {
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

  public getRelativePathInSection(projectId: string, section: SectionKey, itemUri: vscode.Uri): string {
    const root = this.getSectionRootUri(projectId, section);
    const rel = path.posix.relative(root.path, itemUri.path);
    return rel === "." ? "" : rel;
  }

  public getSectionDefinition(section: SectionKey) {
    return SECTIONS.find((s) => s.key === section) as (typeof SECTIONS)[number];
  }

  public sectionHasGate(section: SectionKey): boolean {
    return this.getSectionDefinition(section).hasGate;
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

  private async listAllSectionFileRelativePaths(projectId: string, section: SectionKey): Promise<string[]> {
    const root = this.getSectionRootUri(projectId, section);
    const output: string[] = [];

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

  private async autoApproveAllFilesInSection(projectId: string, section: SectionKey): Promise<void> {
    const files = await this.listAllSectionFileRelativePaths(projectId, section);
    if (files.length === 0) {
      return;
    }
    const approvals: FileApprovals = {};
    for (const relativePath of files) {
      approvals[relativePath] = { approvedAt: nowIso(), comment: "Auto-approved on import" };
    }
    await this.writeJson(this.getSectionApprovalsUri(projectId, section), approvals);
  }

  private async readApprovals(projectId: string, section: SectionKey): Promise<FileApprovals> {
    const approvals = await this.readJson<FileApprovals>(this.getSectionApprovalsUri(projectId, section));
    return approvals ?? {};
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

  private buildDefaultSectionStates(): SectionState[] {
    const firstGatedSection = SECTIONS.find((section) => section.hasGate)?.key;

    return SECTIONS.map((section) => ({
      section: section.key,
      status: !section.hasGate ? "APPROVED" : section.key === firstGatedSection ? "PENDING_REVIEW" : "LOCKED",
      approvedAt: null,
      comment: null,
      updatedAt: nowIso()
    }));
  }

  private getStarterContent(section: SectionKey, fileName: string): string {
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

  private getNewFileTemplate(section: SectionKey, fileName: string, title: string): string {
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

  private async readSectionIndexDescriptions(projectId: string, section: SectionKey): Promise<Record<string, string>> {
    const indexUri = this.getSectionIndexUri(projectId, section);
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
    projectId: string,
    section: SectionKey,
    overrides: Record<string, string> = {}
  ): Promise<void> {
    const sectionRoot = this.getSectionRootUri(projectId, section);
    await this.ensureDir(sectionRoot);

    const files = (await this.listAllSectionFileRelativePaths(projectId, section)).sort((a, b) => a.localeCompare(b));
    const existing = await this.readSectionIndexDescriptions(projectId, section);
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
    await this.writeFile(this.getSectionIndexUri(projectId, section), lines.join("\n"));
  }

  private async deleteIfExists(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      return;
    }

    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
  }

  private async copyDirectoryContents(fromDir: vscode.Uri, toDir: vscode.Uri): Promise<void> {
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
