import * as path from "node:path";
import * as vscode from "vscode";
import { SectionKey, SECTIONS } from "./models";
import { ProjectItem, ProjectsTreeProvider } from "./providers/projectsTreeProvider";
import { SectionNodeItem, SectionTreeProvider } from "./providers/sectionTreeProvider";
import { ScaffoldStorage } from "./storage";

interface SessionState {
  activeProjectId: string | null;
}

const ACTIVE_PROJECT_STATE_KEY = "scaffold.activeProjectId";
const DEFAULT_READY_TO_BUILD_PROMPT_TEMPLATE = [
  "You are generating Ready-to-Build implementation tasks for Scaffold.",
  "",
  "Active project:",
  "- Name: {{projectName}}",
  "- ID: {{projectId}}",
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
  "- Ready to Build: {{readyToBuildPath}}",
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
  "You are starting implementation in the Build section for Scaffold.",
  "",
  "Active project:",
  "- Name: {{projectName}}",
  "- ID: {{projectId}}",
  "",
  "Read these planning sources first:",
  "1) Knowledge Base index: {{knowledgeBaseIndexPath}}",
  "2) Product Requirement Document index: {{prdIndexPath}}",
  "3) Design index: {{designIndexPath}}",
  "4) Engineering Plan index: {{engineeringPlanIndexPath}}",
  "5) Ready to Build index: {{readyToBuildIndexPath}}",
  "",
  "Implementation target:",
  "- Build root: {{buildPath}}",
  "- Keep all generated code under this project folder.",
  "- Respect existing file structure unless a change is required.",
  "",
  "Task:",
  "- Start coding the highest-priority tasks from Ready to Build.",
  "- Create/update files directly in {{buildPath}} and related project paths.",
  "- Keep changes small and incremental.",
  "- Include tests where appropriate.",
  "",
  "Output:",
  "1) File-by-file change plan",
  "2) Exact code edits",
  "3) Validation steps and any open questions"
].join("\n");

const DEFAULT_ONBOARD_PROMPT_TEMPLATE = [
  "You are onboarding an existing codebase into Scaffold project sections.",
  "Thoroughly analyze the entire codebase and produce a structured output folder that can be imported into Scaffold as-is.",
  "",
  "=== WORKSPACE CONTEXT ===",
  "- Workspace root : {{workspaceRootPath}}",
  "- Project id     : {{projectId}}",
  "- Project name   : {{projectName}}",
  "",
  "=== OUTPUT FOLDER STRUCTURE ===",
  "Create one subfolder per section using EXACTLY these folder names:",
  "  {{knowledgeBasePath}}",
  "  {{prdPath}}",
  "  {{designPath}}",
  "  {{engineeringPlanPath}}",
  "  {{readyToBuildPath}}",
  "  {{buildPath}}",
  "",
  "=== SECTION DETAILS ===",
  "",
  "--- 1. knowledge-base ---",
  "PURPOSE : Reference documentation and background knowledge about the existing system.",
  "ANALYZE : README files, wikis, inline code comments, existing docs/, architecture notes,",
  "          environment/config files (.env.example, docker-compose, CI configs), dependency",
  "          manifests (package.json, requirements.txt, go.mod, Cargo.toml, pom.xml).",
  "PRODUCE :",
  "  - overview.md          — High-level description: what the system is, who uses it, core value.",
  "  - tech-stack.md        — Languages, frameworks, major libraries with versions.",
  "  - architecture.md      — Component/service map, data flow, external integrations.",
  "  - data-model.md        — Key entities, relationships, DB schema summary.",
  "  - environment.md       — Environment variables, secrets, infrastructure requirements.",
  "  - dependencies.md      — Notable third-party dependencies and their role.",
  "  - conventions.md       — Coding conventions, naming patterns, folder structure rules.",
  "  - glossary.md          — Domain-specific terms and abbreviations found in the code.",
  "FILE FORMAT: .md (Markdown). Use headings, tables, and code blocks where helpful.",
  "",
  "--- 2. prd ---",
  "PURPOSE : Product Requirement Document — what the product must do from a user/business perspective.",
  "ANALYZE : Existing feature code, route handlers, UI screens, user-facing API endpoints,",
  "          test descriptions, issue tracker references in comments, changelog entries.",
  "PRODUCE :",
  "  - product-overview.md  — Vision, goals, target users, success metrics.",
  "  - features.md          — Exhaustive list of existing features grouped by domain.",
  "                           For each feature: name, description, user story, acceptance criteria.",
  "  - user-flows.md        — Step-by-step user journeys for key workflows.",
  "  - non-functional.md    — Performance, security, accessibility, and compliance requirements",
  "                           inferred from the codebase (rate limiting, auth, CORS, etc.).",
  "  - out-of-scope.md      — Capabilities explicitly NOT present; gaps you observe.",
  "FILE FORMAT: .md only. Use numbered lists and tables for requirements and criteria.",
  "",
  "--- 3. design ---",
  "PURPOSE : Visual / UI design artifacts and component specifications.",
  "ANALYZE : Existing HTML templates, JSX/TSX component files, CSS/Tailwind classes,",
  "          design tokens, theme files, Storybook stories, screenshot/image assets.",
  "PRODUCE :",
  "  - component-inventory.html  — A styled HTML page listing every UI component found:",
  "                                 name, file path, props/variants, screenshot placeholder.",
  "  - color-typography.html     — Design tokens: color palette, font families, sizes, spacing",
  "                                 rendered as a visual swatch page.",
  "  - layout-patterns.html      — Grid systems, responsive breakpoints, common layout shells",
  "                                 illustrated with annotated HTML mockups.",
  "  - ui-states.html            — Loading, empty, error, and success states per component.",
  "FILE FORMAT: .html only. Each file must be a self-contained, browser-openable HTML page",
  "with inline CSS. No external CDN dependencies.",
  "",
  "--- 4. engineering-plan ---",
  "PURPOSE : Technical implementation plan: how the system is built and how to evolve it.",
  "ANALYZE : Source folder structure, module boundaries, service/API contracts, test suite",
  "          layout, CI/CD pipeline configs, migration files, infrastructure-as-code.",
  "PRODUCE :",
  "  - system-design.md          — Detailed component design: classes, modules, interfaces,",
  "                                 database tables, API routes with method + payload.",
  "  - data-flow.md              — How data moves through the system end-to-end per feature.",
  "  - api-contracts.md          — All internal/external API endpoints: path, method, request",
  "                                 schema, response schema, auth requirements.",
  "  - infrastructure.md         — Deployment topology, cloud services, container setup,",
  "                                 environment tiers (dev/staging/prod).",
  "  - testing-strategy.md       — Existing test coverage, testing frameworks, what to test next.",
  "  - tech-debt.md              — Known hacks, TODOs, deprecated patterns, security issues.",
  "  - migration-plan.md         — DB migrations present; suggested future migration steps.",
  "  - sequence-diagrams.puml    — PlantUML sequence diagrams for the top 3–5 critical flows.",
  "FILE FORMAT: .md for prose files, .puml for PlantUML diagrams. Use code blocks for",
  "schemas, curl examples, and TypeScript/language interfaces.",
  "",
  "--- 5. ready-to-build ---",
  "PURPOSE : Prioritized task list of planned tasks. Left EMPTY during onboarding.",
  "PRODUCE : Nothing. Do not create any files in this folder.",
  "REASON  : No tasks have been planned yet. The team will populate this section manually",
  "          after reviewing the knowledge-base, prd, design, and engineering-plan artifacts.",
  "",
  "--- 6. build ---",
  "PURPOSE : The complete existing codebase copied verbatim — this is the working source of truth.",
  "ANALYZE : Every source file in the existing project.",
  "PRODUCE :",
  "  - Copy the ENTIRE codebase AS-IS into the build/ subfolder, preserving the full",
  "    original directory structure and all file names exactly.",
  "  - Do NOT modify, summarise, or filter any source file — copy byte-for-byte.",
  "  - Preserve ALL file extensions exactly as they are in the original project.",
  "  - The only files to OMIT are: node_modules/, .git/, build/dist/out output dirs,",
  "    compiled artefacts (.class, .pyc, __pycache__), and binary/media assets",
  "    (.png, .jpg, .gif, .svg, .ico, .woff, .ttf, .mp4, .zip, .tar).",
  "  - DO include: all source code, config files, scripts, SQL, Dockerfiles,",
  "    CI configs, .env.example, lock files (package-lock.json, pnpm-lock.yaml, etc.).",
  "  - Add a build-notes.md at the root of build/ listing: total files copied,",
  "    any files intentionally omitted and why, and the original project root path.",
  "FILE FORMAT: every file keeps its original extension. build-notes.md in Markdown.",
  "",
  "=== GLOBAL RULES ===",
  "1. Use the EXACT subfolder names listed above (knowledge-base, prd, design,",
  "   engineering-plan, ready-to-build, build). Do not rename or nest them.",
  "2. Every .md file must start with a # H1 heading matching the file's purpose.",
  "3. Every .html file must be a complete, self-contained HTML5 document.",
  "4. Every .puml file must start with @startuml and end with @enduml.",
  "5. Do not include placeholder text like 'TODO: fill this in'. If information",
  "   cannot be determined from the codebase, state 'Not found in codebase' explicitly.",
  "6. Be thorough — it is better to include too much detail than too little.",
  "7. Cross-reference between files (e.g. 'see prd/features.md') where relevant.",
  "",
  "=== OUTPUT REQUIREMENT ===",
  "Produce a single local folder (you choose the name) containing exactly the six",
  "section subfolders above with all files populated. When done, provide the absolute",
  "path to the generated folder so it can be imported into Scaffold."
].join("\n");

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("Scaffold requires an open workspace folder.");
    return;
  }

  const storage = new ScaffoldStorage(workspaceFolder);
  await storage.initialize();
  const workspaceFolderUri = workspaceFolder.uri;

  const state: SessionState = {
    activeProjectId: context.workspaceState.get<string | null>(ACTIVE_PROJECT_STATE_KEY, null)
  };

  const projectsProvider = new ProjectsTreeProvider(storage);
  const sectionProviders = new Map<SectionKey, SectionTreeProvider>();

  const projectsView = vscode.window.createTreeView("scaffold.projects", { treeDataProvider: projectsProvider });
  context.subscriptions.push(projectsView);

  for (const section of SECTIONS) {
    const provider = new SectionTreeProvider(storage, section.key);
    sectionProviders.set(section.key, provider);
    const view = vscode.window.createTreeView(section.viewId, { treeDataProvider: provider });
    context.subscriptions.push(view);
  }

  // Watcher for visible project content folder ({workspaceRoot}/{projectId}/**)
  let contentWatcher: vscode.Disposable | null = null;

  async function setActiveProject(projectId: string | null): Promise<void> {
    state.activeProjectId = projectId;
    await context.workspaceState.update(ACTIVE_PROJECT_STATE_KEY, projectId);

    projectsProvider.setActiveProject(projectId);
    for (const provider of sectionProviders.values()) {
      provider.setActiveProject(projectId);
    }

    await vscode.commands.executeCommand("setContext", "scaffoldProjectActive", Boolean(projectId));

    // Dispose previous content watcher and create a new one for the active project's visible folder
    contentWatcher?.dispose();
    contentWatcher = null;
    if (projectId) {
      const contentPattern = new vscode.RelativePattern(workspaceFolderUri, `${projectId}/**/*`);
      const cw = vscode.workspace.createFileSystemWatcher(contentPattern);
      cw.onDidCreate(() => void refreshAll());
      cw.onDidChange((uri) => {
        void refreshAll();
        void appendBuildManualLogFromFs("edited", uri);
      });
      cw.onDidDelete((uri) => {
        void refreshAll();
        void appendBuildManualLogFromFs("deleted", uri);
      });
      contentWatcher = cw;
      context.subscriptions.push(cw);
    }
  }

  async function refreshAll(): Promise<void> {
    projectsProvider.refresh();
    for (const provider of sectionProviders.values()) {
      provider.refresh();
    }
  }

  await setActiveProject(state.activeProjectId);

  const watcherPattern = new vscode.RelativePattern(workspaceFolder, `${storage.getConfig().dataFolder}/**/*`);
  const watcher = vscode.workspace.createFileSystemWatcher(watcherPattern);
  watcher.onDidCreate(() => void refreshAll());
  watcher.onDidChange(() => void refreshAll());
  watcher.onDidDelete(() => void refreshAll());
  context.subscriptions.push(watcher);

  async function appendBuildManualLogFromFs(event: "edited" | "deleted", fileUri: vscode.Uri): Promise<void> {
    if (!state.activeProjectId) {
      return;
    }

    const buildRoot = storage.getSectionRootUri(state.activeProjectId, "build");
    const relative = path.relative(buildRoot.fsPath, fileUri.fsPath).split(path.sep).join("/");
    if (!relative || relative.startsWith("..")) {
      return;
    }
    const lowered = relative.toLowerCase();
    if (lowered === "manual-change-log.md" || lowered === "index.md") {
      return;
    }

    const action = event === "edited" ? "Edited" : "Deleted";
    await storage.appendBuildManualChangeLog(state.activeProjectId, `${action} file: ${relative}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.initializeWorkspace", async () => {
      await storage.initialize();
      await refreshAll();
      vscode.window.showInformationMessage("Scaffold workspace initialized.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.refresh", async () => {
      await refreshAll();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.setActiveProject", async (input?: ProjectItem | string) => {
      let projectId: string | null = null;

      if (typeof input === "string") {
        projectId = input;
      } else if (input instanceof ProjectItem) {
        projectId = input.project.id;
      }

      if (!projectId) {
        const projects = await storage.listProjects();
        if (projects.length === 0) {
          vscode.window.showInformationMessage("Create a project first.");
          return;
        }

        const selected = await vscode.window.showQuickPick(
          projects.map((project) => ({ label: project.name, detail: project.id, project })),
          { placeHolder: "Select active project" }
        );

        projectId = selected?.project.id ?? null;
      }

      if (!projectId) {
        return;
      }

      await setActiveProject(projectId);
      await refreshAll();
      vscode.window.showInformationMessage("Active project set.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.createProject", async () => {
      const name = await vscode.window.showInputBox({
        title: "Create Scaffold Project",
        prompt: "Project name",
        validateInput: (value) => (value.trim().length < 2 ? "Project name must be at least 2 characters." : null)
      });

      if (!name) {
        return;
      }

      const project = await storage.createProject(name.trim());
      await setActiveProject(project.id);
      await refreshAll();
      vscode.window.showInformationMessage(`Project created: ${project.name}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.deleteProject", async (input?: ProjectItem | string) => {
      let projectId: string | null = null;
      let projectName = "this project";

      if (typeof input === "string") {
        projectId = input;
      } else if (input instanceof ProjectItem) {
        projectId = input.project.id;
        projectName = input.project.name;
      }

      if (!projectId) {
        const projects = await storage.listProjects();
        if (projects.length === 0) {
          vscode.window.showInformationMessage("No projects found to delete.");
          return;
        }

        const selected = await vscode.window.showQuickPick(
          projects.map((project) => ({
            label: project.name,
            description: project.id === state.activeProjectId ? "active" : undefined,
            project
          })),
          { placeHolder: "Select project to delete" }
        );

        if (!selected) {
          return;
        }

        projectId = selected.project.id;
        projectName = selected.project.name;
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Delete project "${projectName}"? This removes project files and metadata.`,
        { modal: true },
        "Delete"
      );

      if (confirmed !== "Delete") {
        return;
      }

      try {
        await storage.deleteProject(projectId);

        if (state.activeProjectId === projectId) {
          await setActiveProject(null);
        }

        await refreshAll();
        vscode.window.showInformationMessage(`Deleted project: ${projectName}`);
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to delete project.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.onboardExistingProject", async (input?: ProjectItem | string) => {
      const projects = await storage.listProjects();
      if (projects.length === 0) {
        vscode.window.showInformationMessage("Create a project first.");
        return;
      }

      let targetProjectId: string | null = null;
      if (typeof input === "string") {
        targetProjectId = input;
      } else if (input instanceof ProjectItem) {
        targetProjectId = input.project.id;
      } else if (state.activeProjectId) {
        targetProjectId = state.activeProjectId;
      }

      if (!targetProjectId) {
        const selected = await vscode.window.showQuickPick(
          projects.map((project) => ({ label: project.name, detail: project.id, project })),
          { placeHolder: "Select target Scaffold project for onboarding import" }
        );

        if (!selected) {
          return;
        }

        targetProjectId = selected.project.id;
      }

      const projectMeta = await storage.getProjectMeta(targetProjectId);
      if (!projectMeta) {
        vscode.window.showErrorMessage("Target project metadata not found.");
        return;
      }

      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("onboardPromptTemplate", DEFAULT_ONBOARD_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("onboardPromptOutput", "both");
      const toRelativePath = (uri: vscode.Uri): string => path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        workspaceRootPath: workspaceFolderUri.fsPath,
        projectName: projectMeta.name,
        projectId: projectMeta.id,
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "prd")),
        designPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "readyToBuild")),
        buildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "build"))
      };

      const prompt = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) => replacements[key] ?? full);

      if (outputMode === "clipboard" || outputMode === "both") {
        await vscode.env.clipboard.writeText(prompt);
      }

      if (outputMode === "editor" || outputMode === "both") {
        const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: prompt });
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      const importChoice = await vscode.window.showInformationMessage(
        "Onboarding prompt generated. Import generated folder now?",
        "Import Folder",
        "Later"
      );

      if (importChoice !== "Import Folder") {
        return;
      }

      const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Import Generated Folder"
      });

      if (!selectedFolder || selectedFolder.length === 0) {
        return;
      }

      try {
        await storage.importGeneratedOnboardingFolder(projectMeta.id, selectedFolder[0]);
        await setActiveProject(projectMeta.id);
        await refreshAll();
        vscode.window.showInformationMessage("Onboarding folder imported into project sections.");
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to import onboarding folder.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.generateReadyToBuildPrompt", async () => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }

      const projectMeta = await storage.getProjectMeta(state.activeProjectId);
      if (!projectMeta) {
        vscode.window.showErrorMessage("Active project metadata not found.");
        return;
      }

      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("readyToBuildPromptTemplate", DEFAULT_READY_TO_BUILD_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("readyToBuildPromptOutput", "both");

      const toRelativePath = (uri: vscode.Uri): string => path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        projectName: projectMeta.name,
        projectId: projectMeta.id,
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "prd")),
        designPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "readyToBuild")),
        buildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "build")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "readyToBuild")),
        buildIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "build"))
      };

      const prompt = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) => replacements[key] ?? full);

      if (outputMode === "clipboard" || outputMode === "both") {
        await vscode.env.clipboard.writeText(prompt);
      }

      if (outputMode === "editor" || outputMode === "both") {
        const doc = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: prompt
        });
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      const outcome = outputMode === "both" ? "editor and clipboard" : outputMode;
      vscode.window.showInformationMessage(`Ready-to-Build prompt generated to ${outcome}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.generateBuildPrompt", async () => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }

      const projectMeta = await storage.getProjectMeta(state.activeProjectId);
      if (!projectMeta) {
        vscode.window.showErrorMessage("Active project metadata not found.");
        return;
      }

      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("buildPromptTemplate", DEFAULT_BUILD_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("buildPromptOutput", "both");

      const toRelativePath = (uri: vscode.Uri): string => path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        projectName: projectMeta.name,
        projectId: projectMeta.id,
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "prd")),
        designPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "readyToBuild")),
        buildPath: toRelativePath(storage.getSectionRootUri(projectMeta.id, "build")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "readyToBuild")),
        buildIndexPath: toRelativePath(storage.getSectionIndexUri(projectMeta.id, "build"))
      };

      const prompt = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) => replacements[key] ?? full);

      if (outputMode === "clipboard" || outputMode === "both") {
        await vscode.env.clipboard.writeText(prompt);
      }

      if (outputMode === "editor" || outputMode === "both") {
        const doc = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: prompt
        });
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      const outcome = outputMode === "both" ? "editor and clipboard" : outputMode;
      vscode.window.showInformationMessage(`Build coding prompt generated to ${outcome}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.openBuildFolderExternal", async () => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }

      const buildRoot = storage.getSectionRootUri(state.activeProjectId, "build");
      try {
        // Prefer reveal in OS so user can open with any external editor from Finder/Explorer.
        await vscode.commands.executeCommand("revealFileInOS", buildRoot);
      } catch {
        // Fallback: ask OS to open the folder URI with default handler.
        const opened = await vscode.env.openExternal(buildRoot);
        if (!opened) {
          vscode.window.showErrorMessage("Failed to open Build folder externally.");
          return;
        }
      }
    })
  );

  async function createFileForSection(section: SectionKey, input?: SectionNodeItem): Promise<void> {
    if (!state.activeProjectId) {
      vscode.window.showWarningMessage("Set an active project first.");
      return;
    }

    const supportedExts = storage.getSupportedFileExtensions(section).join(", ");
    const defaultExt = storage.getDefaultFileExtension(section);
    const pageName = await vscode.window.showInputBox({
      title: `Create ${storage.getSectionDefinition(section).label} File`,
      prompt: `File name (supported: ${supportedExts}; default: ${defaultExt})`,
      validateInput: (value) => (value.trim().length < 2 ? "File title must be at least 2 characters." : null)
    });

    if (!pageName) {
      return;
    }

    let description: string | null = null;
    if (section === "knowledgeBase") {
      const descInput = await vscode.window.showInputBox({
        title: "Knowledge File Description",
        prompt: "Short description for index entry",
        validateInput: (value) => (value.trim().length < 2 ? "Description must be at least 2 characters." : null)
      });

      if (!descInput) {
        return;
      }

      description = descInput.trim();
    }

    const relativeDir = input && input.isDirectory ? storage.getRelativePathInSection(state.activeProjectId, section, input.uri) : "";

    try {
      const pageUri = await storage.createSectionFile(state.activeProjectId, section, relativeDir, pageName.trim(), description);
      await refreshAll();
      await vscode.commands.executeCommand("vscode.open", pageUri);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to create file.");
    }
  }

  async function createFolderForSection(section: SectionKey, input?: SectionNodeItem): Promise<void> {
    if (!state.activeProjectId) {
      vscode.window.showWarningMessage("Set an active project first.");
      return;
    }

    const folderName = await vscode.window.showInputBox({
      title: `Create ${storage.getSectionDefinition(section).label} Folder`,
      prompt: "Folder name",
      validateInput: (value) => (value.trim().length < 2 ? "Folder name must be at least 2 characters." : null)
    });

    if (!folderName) {
      return;
    }

    const relativeDir = input && input.isDirectory ? storage.getRelativePathInSection(state.activeProjectId, section, input.uri) : "";

    try {
      await storage.createSectionFolder(state.activeProjectId, section, relativeDir, folderName.trim());
      await refreshAll();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to create folder.");
    }
  }

  async function approveSection(section: SectionKey): Promise<void> {
    if (!state.activeProjectId) {
      vscode.window.showWarningMessage("Set an active project first.");
      return;
    }

    const comment = await vscode.window.showInputBox({
      title: `Approve ${storage.getSectionDefinition(section).label} Section`,
      prompt: "Optional approval note"
    });

    try {
      await storage.approveSection(state.activeProjectId, section, comment ?? null);
      await refreshAll();
      vscode.window.showInformationMessage(`${storage.getSectionDefinition(section).label} section approved.`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to approve section.");
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.approveSection", async (input?: SectionKey) => {
      if (input) {
        await approveSection(input);
        return;
      }

      const choice = await vscode.window.showQuickPick(
        SECTIONS.filter((section) => section.hasGate).map((section) => ({ label: section.label, section: section.key })),
        { placeHolder: "Select section to approve" }
      );

      if (choice) {
        await approveSection(choice.section);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.approveFile", async (input?: SectionNodeItem) => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }

      if (!(input instanceof SectionNodeItem) || input.isDirectory) {
        vscode.window.showInformationMessage("Select an approvable file.");
        return;
      }

      if (!storage.sectionHasGate(input.section)) {
        vscode.window.showInformationMessage("This section does not require file approval.");
        return;
      }

      const comment = await vscode.window.showInputBox({
        title: "Approve File",
        prompt: "Optional file approval note"
      });

      try {
        await storage.approveFile(state.activeProjectId, input.section, input.uri, comment ?? null);
        await refreshAll();
        vscode.window.showInformationMessage("File approved.");
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to approve file.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.createFileInSection", async (input?: SectionNodeItem, sectionArg?: SectionKey) => {
      const section = sectionArg ?? input?.section;
      if (!section) {
        vscode.window.showInformationMessage("Section not provided.");
        return;
      }
      await createFileForSection(section, input);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.createFolderInSection", async (input?: SectionNodeItem, sectionArg?: SectionKey) => {
      const section = sectionArg ?? input?.section;
      if (!section) {
        vscode.window.showInformationMessage("Section not provided.");
        return;
      }
      await createFolderForSection(section, input);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.renameItem", async (input?: SectionNodeItem) => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }
      if (!(input instanceof SectionNodeItem)) {
        vscode.window.showInformationMessage("Select a file or folder to rename.");
        return;
      }

      const currentName = input.uri.path.split("/").pop() ?? "";
      const supportedExts = storage.getSupportedFileExtensions(input.section);
      const matchedExt = supportedExts.find((ext) => currentName.toLowerCase().endsWith(ext));
      const nameWithoutExt = matchedExt ? currentName.slice(0, -matchedExt.length) : currentName;

      const newName = await vscode.window.showInputBox({
        title: "Rename",
        prompt: `New name (supported: ${supportedExts.join(", ")})`,
        value: nameWithoutExt,
        validateInput: (v) => {
          if (v.trim().length < 1) { return "Name must not be empty."; }
          if (v.includes("/") || v.includes("\\")) { return "Name must not contain path separators."; }
          return null;
        }
      });

      if (!newName) { return; }

      try {
        await storage.renameItem(state.activeProjectId, input.section, input.uri, newName.trim());
        await refreshAll();
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to rename.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("scaffold.deleteItem", async (input?: SectionNodeItem) => {
      if (!state.activeProjectId) {
        vscode.window.showWarningMessage("Set an active project first.");
        return;
      }
      if (!(input instanceof SectionNodeItem)) {
        vscode.window.showInformationMessage("Select a file or folder to delete.");
        return;
      }

      const label = input.uri.path.split("/").pop() ?? "item";
      const kind = input.isDirectory ? "folder" : "file";
      const answer = await vscode.window.showWarningMessage(
        `Delete ${kind} "${label}"? This cannot be undone.`,
        { modal: true },
        "Delete"
      );
      if (answer !== "Delete") { return; }

      try {
        await storage.deleteItem(state.activeProjectId, input.section, input.uri, input.isDirectory);
        await refreshAll();
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : "Failed to delete.");
      }
    })
  );

  for (const section of SECTIONS) {
    // Ready to Build is read-only — no create commands registered for it
    if (section.key !== "readyToBuild") {
      context.subscriptions.push(
        vscode.commands.registerCommand(`scaffold.create${section.key[0].toUpperCase()}${section.key.slice(1)}File`, async () => {
          await createFileForSection(section.key);
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand(`scaffold.create${section.key[0].toUpperCase()}${section.key.slice(1)}Folder`, async () => {
          await createFolderForSection(section.key);
        })
      );
    }

    if (section.hasGate) {
      context.subscriptions.push(
        vscode.commands.registerCommand(`scaffold.approve${section.key[0].toUpperCase()}${section.key.slice(1)}Section`, async () => {
          await approveSection(section.key);
        })
      );
    }
  }
}

export function deactivate(): void {
  // no-op
}
