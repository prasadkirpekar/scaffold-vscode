import * as path from "node:path";
import * as vscode from "vscode";
import { SectionKey, SECTIONS } from "./models";
import { SectionNodeItem, SectionTreeProvider } from "./providers/sectionTreeProvider";
import { ScaffoldStorage } from "./storage";

const DEFAULT_READY_TO_BUILD_PROMPT_TEMPLATE = [
  "You are generating Ready-to-Code implementation tasks for Scaffold.",
  "",
  "Source of truth (read in order):",
  "1) Knowledge Base index: {{knowledgeBaseIndexPath}}",
  "2) Product Requirement Document index: {{prdIndexPath}}",
  "3) Design index: {{designIndexPath}}",
  "4) Engineering Plan index: {{engineeringPlanIndexPath}}",
  "",
  "Section roots:",
  "- Knowledge Base: {{knowledgeBasePath}}",
  "- Product Requirement Document: {{prdPath}}",
  "- Design: {{designPath}}",
  "- Engineering Plan: {{engineeringPlanPath}}",
  "- Ready to Code: {{readyToBuildPath}}",
  "",
  "Task:",
  "Generate executable implementation tasks and produce:",
  "- one master backlog file",
  "- multiple task files grouped by feature/epic",
  "- each task with id, title, description, dependencies, acceptance criteria, tests, estimate (S/M/L), and risk",
  "",
  "Constraints:",
  "- Do not invent features beyond source docs.",
  "- Add explicit Open Question tasks for ambiguities.",
  "- Keep tasks implementation-ready and testable.",
  "- Prefer incremental vertical slices.",
  "",
  "Output:",
  "1) Proposed file tree under {{readyToBuildPath}}",
  "2) Full file contents",
  "3) Traceability table from tasks to source files"
].join("\n");

const DEFAULT_BUILD_PROMPT_TEMPLATE = [
  "You are starting implementation in the Code section for Scaffold.",
  "",
  "Read these planning sources first:",
  "1) Knowledge Base index: {{knowledgeBaseIndexPath}}",
  "2) Product Requirement Document index: {{prdIndexPath}}",
  "3) Design index: {{designIndexPath}}",
  "4) Engineering Plan index: {{engineeringPlanIndexPath}}",
  "5) Ready to Code index: {{readyToBuildIndexPath}}",
  "",
  "Implementation target:",
  "- Code root: {{buildPath}}",
  "- Keep all generated code under the project folder.",
  "- Respect existing file structure unless a change is required.",
  "",
  "Task:",
  "- Start coding the highest-priority tasks from Ready to Code.",
  "- Create/update files directly in {{buildPath}} and related project paths.",
  "- Keep changes small and incremental.",
  "- Include tests where appropriate.",
  "",
  "Output:",
  "1) File-by-file change plan",
  "2) Exact code edits",
  "3) Validation steps and any open questions"
].join("\n");

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Scaffold requires an open workspace folder.");
    return;
  }

  const workspaceFolderUri = workspaceFolder.uri;
  const storage = new ScaffoldStorage(workspaceFolder);

  const providers = new Map<SectionKey, SectionTreeProvider>(
    SECTIONS.map((s) => [s.key, new SectionTreeProvider(storage, s.key)])
  );

  for (const section of SECTIONS) {
    const provider = providers.get(section.key)!;
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider(section.viewId, provider)
    );
  }

  const refreshAll = (): void => {
    for (const provider of providers.values()) {
      provider.refresh();
    }
  };

  const updateContext = async (): Promise<void> => {
    const initialized = await storage.isInitialized();
    await vscode.commands.executeCommand("setContext", "scaffold.initialized", initialized);
    if (!initialized) {
      return;
    }
    const states = await storage.listSectionStates();
    for (const state of states) {
      await vscode.commands.executeCommand(
        "setContext",
        `scaffold.section.${state.section}.status`,
        state.status
      );
    }
  };

  await updateContext();

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.initializeWorkspace", async () => {
      try {
        await storage.initialize();
        await updateContext();
        refreshAll();
        vscode.window.showInformationMessage("Scaffold workspace initialized.");
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to initialize workspace: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand("scaffold.approveSection", async (section?: SectionKey) => {
      if (!section) {
        return;
      }
      const comment = await vscode.window.showInputBox({
        prompt: `Enter approval comment for ${storage.getSectionDefinition(section).label}`,
        placeHolder: "Looks good!"
      });
      if (comment === undefined) {
        return;
      }
      try {
        await storage.approveSection(section, comment || null);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.approveFile", async (node?: SectionNodeItem) => {
      if (!node) {
        return;
      }
      const comment = await vscode.window.showInputBox({
        prompt: `Enter approval comment for ${path.basename(node.uri.path)}`,
        placeHolder: "Approved"
      });
      if (comment === undefined) {
        return;
      }
      try {
        await storage.approveFile(node.section, node.uri, comment || null);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createFileInSection", async (node?: SectionNodeItem) => {
      if (!node || !node.isDirectory) {
        return;
      }
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const relativeDir = storage.getRelativePathInSection(node.section, node.uri);
        const newUri = await storage.createSectionFile(node.section, relativeDir, name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createFolderInSection", async (node?: SectionNodeItem) => {
      if (!node || !node.isDirectory) {
        return;
      }
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        const relativeDir = storage.getRelativePathInSection(node.section, node.uri);
        await storage.createSectionFolder(node.section, relativeDir, name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createKnowledgeBaseFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("knowledgeBase", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createKnowledgeBaseFolder", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        await storage.createSectionFolder("knowledgeBase", "", name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createPrdFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("prd", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createPrdFolder", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        await storage.createSectionFolder("prd", "", name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.approvePrdSection", async () => {
      vscode.commands.executeCommand("scaffold.approveSection", "prd");
    }),

    vscode.commands.registerCommand("scaffold.createDesignFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("design", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createDesignFolder", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        await storage.createSectionFolder("design", "", name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.approveDesignSection", async () => {
      vscode.commands.executeCommand("scaffold.approveSection", "design");
    }),

    vscode.commands.registerCommand("scaffold.createEngineeringPlanFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("engineeringPlan", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createEngineeringPlanFolder", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        await storage.createSectionFolder("engineeringPlan", "", name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.approveEngineeringPlanSection", async () => {
      vscode.commands.executeCommand("scaffold.approveSection", "engineeringPlan");
    }),

    vscode.commands.registerCommand("scaffold.approveReadyToBuildSection", async () => {
      vscode.commands.executeCommand("scaffold.approveSection", "readyToBuild");
    }),

    vscode.commands.registerCommand("scaffold.generateReadyToBuildPrompt", async () => {
      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("readyToBuildPromptTemplate", DEFAULT_READY_TO_BUILD_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("readyToBuildPromptOutput", "both");
      const toRelativePath = (uri: vscode.Uri): string =>
        path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri("knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri("prd")),
        designPath: toRelativePath(storage.getSectionRootUri("design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri("engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri("readyToBuild")),
        buildPath: toRelativePath(storage.getSectionRootUri("build")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri("knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri("prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri("design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri("engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri("readyToBuild")),
        buildIndexPath: toRelativePath(storage.getSectionIndexUri("build"))
      };

      const prompt = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) => replacements[key] ?? full);

      if (outputMode === "clipboard" || outputMode === "both") {
        await vscode.env.clipboard.writeText(prompt);
      }

      if (outputMode === "editor" || outputMode === "both") {
        const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: prompt });
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      vscode.window.showInformationMessage(
        outputMode === "both"
          ? "Ready-to-Code prompt copied to clipboard and opened in editor."
          : outputMode === "clipboard"
            ? "Ready-to-Code prompt copied to clipboard."
            : "Ready-to-Code prompt opened in editor."
      );
    }),

    vscode.commands.registerCommand("scaffold.createBuildFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("build", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createBuildFolder", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter folder name" });
      if (!name) {
        return;
      }
      try {
        await storage.createSectionFolder("build", "", name);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.generateBuildPrompt", async () => {
      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("buildPromptTemplate", DEFAULT_BUILD_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("buildPromptOutput", "both");
      const toRelativePath = (uri: vscode.Uri): string =>
        path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri("knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri("prd")),
        designPath: toRelativePath(storage.getSectionRootUri("design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri("engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri("readyToBuild")),
        buildPath: toRelativePath(storage.getSectionRootUri("build")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri("knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri("prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri("design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri("engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri("readyToBuild")),
        buildIndexPath: toRelativePath(storage.getSectionIndexUri("build"))
      };

      const prompt = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) => replacements[key] ?? full);

      if (outputMode === "clipboard" || outputMode === "both") {
        await vscode.env.clipboard.writeText(prompt);
      }

      if (outputMode === "editor" || outputMode === "both") {
        const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: prompt });
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      vscode.window.showInformationMessage(
        outputMode === "both"
          ? "Code prompt copied to clipboard and opened in editor."
          : outputMode === "clipboard"
            ? "Code prompt copied to clipboard."
            : "Code prompt opened in editor."
      );
    }),

    vscode.commands.registerCommand("scaffold.openBuildFolderExternal", async () => {
      const uri = storage.getSectionRootUri("build");
      vscode.env.openExternal(uri);
    }),

    vscode.commands.registerCommand("scaffold.renameItem", async (node?: SectionNodeItem) => {
      if (!node) {
        return;
      }
      const newName = await vscode.window.showInputBox({
        prompt: "Enter new name",
        value: path.basename(node.uri.path)
      });
      if (!newName || newName === path.basename(node.uri.path)) {
        return;
      }
      try {
        await storage.renameItem(node.section, node.uri, newName);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.deleteItem", async (node?: SectionNodeItem) => {
      if (!node) {
        return;
      }
      const label = path.basename(node.uri.path);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${label}"?`,
        { modal: true },
        "Delete"
      );
      if (confirm !== "Delete") {
        return;
      }
      try {
        await storage.deleteItem(node.section, node.uri, node.isDirectory);
        refreshAll();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.refresh", () => {
      refreshAll();
    })
  );

  const appendBuildManualLogFromFs = async (uri: vscode.Uri, msg: string) => {
    if (await storage.isInitialized()) {
      await storage.appendBuildManualChangeLog(msg);
    }
  };

  const buildRoot = storage.getSectionRootUri("build");
  const hiddenFolder = storage.getConfig().dataFolder;
  const contentWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(buildRoot, "**/*")
  );

  context.subscriptions.push(
    contentWatcher,
    contentWatcher.onDidCreate(async (uri) => {
      const rel = path.relative(buildRoot.fsPath, uri.fsPath);
      if (rel.startsWith(hiddenFolder)) {
        return;
      }
      await appendBuildManualLogFromFs(uri, `File created: ${rel}`);
    }),
    contentWatcher.onDidDelete(async (uri) => {
      const rel = path.relative(buildRoot.fsPath, uri.fsPath);
      if (rel.startsWith(hiddenFolder)) {
        return;
      }
      await appendBuildManualLogFromFs(uri, `File deleted: ${rel}`);
    })
  );
}

export function deactivate(): void {
  // no-op
}
