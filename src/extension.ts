import * as path from "node:path";
import * as vscode from "vscode";
import { SectionKey, SECTIONS } from "./models";
import { SectionNodeItem, SectionTreeProvider } from "./providers/sectionTreeProvider";
import { ScaffoldStorage } from "./storage";

const DEFAULT_TASK_PLAN_PROMPT_TEMPLATE = [
  "You are responsible for breaking down the product into executable implementation tasks for Scaffold.",
  "",
  "## PLANNING FLOW CONTEXT",
  "",
  "Read the complete planning documents in this order to understand the full scope:",
  "",
  "### 1. Foundation - Knowledge Base",
  "Read: {{knowledgeBaseIndexPath}}",
  "Purpose: Understand context, constraints, assumptions, technical limitations, and domain knowledge.",
  "Extract: Key facts, architectural constraints, technical decisions, and any special considerations.",
  "",
  "### 2. Product Requirements - PRD",
  "Read: {{prdIndexPath}}",
  "Purpose: Understand what features need to be built and why.",
  "Extract: User stories, feature requirements, success criteria, non-functional requirements.",
  "",
  "### 3. User Experience - Design",
  "Read: {{designIndexPath}}",
  "Purpose: Understand UI/UX decisions and design system.",
  "Extract: Component designs, user flows, interaction patterns, visual hierarchy, accessibility requirements.",
  "",
  "### 4. Implementation Strategy - Engineering Plan",
  "Read: {{engineeringPlanIndexPath}}",
  "Purpose: Understand the proposed implementation approach and architecture.",
  "Extract: Tech stack decisions, architectural patterns, module breakdown, dependencies, integration points.",
  "",
  "## TASK GENERATION REQUIREMENTS",
  "",
  "Based on the above documents, generate executable implementation tasks with these characteristics:",
  "",
  "### Task Structure",
  "Each task must include:",
  "- **Task ID**: Unique identifier (e.g., TASK-001, FEAT-USER-001)",
  "- **Title**: Clear, actionable, single-focus title (not 'Build all features')",
  "- **Feature/Epic**: Group related tasks together (e.g., 'User Authentication', 'Dashboard')",
  "- **Description**: What specifically needs to be implemented",
  "- **Context**: Why this task, how it fits into the larger system",
  "- **Dependencies**: Other tasks that must be completed first",
  "- **Acceptance Criteria**: Specific, testable conditions for done-ness",
  "- **Test Strategy**: How to validate the implementation",
  "- **Estimate**: S (small - 1-2 hours), M (medium - 4-8 hours), L (large - 1-2 days)",
  "- **Risk Level**: Low, Medium, High (explain any risks)",
  "- **Files to Create/Modify**: Specific file paths and what goes in each",
  "",
  "### Task Characteristics",
  "- **Granularity**: Each task should be completable in 1-2 days max (break larger items into smaller tasks)",
  "- **Independence**: Tasks should be as independent as possible, but clearly show dependencies",
  "- **Clarity**: Someone new to the project should understand exactly what to do",
  "- **Vertical Slices**: Prefer end-to-end feature slices over horizontal layer-by-layer work",
  "- **Design Compliance**: Every task must reference how it honors the Design decisions",
  "- **Architecture Compliance**: Every task must reference how it follows the Engineering Plan",
  "",
  "### Task Ordering",
  "- **Priority**: Order tasks by business value and implementation dependencies",
  "- **Setup First**: Infrastructure/setup tasks before feature tasks",
  "- **Foundation First**: Core utilities/models before features that use them",
  "- **Testable**: Include testing tasks alongside implementation tasks",
  "",
  "## OUTPUT FORMAT",
  "",
  "Create two outputs:",
  "",
  "### Output 1: Master Backlog File",
  "Create or append to: {{readyToBuildPath}}/backlog.md",
  "Format: Simple checklist with task IDs and titles (for progress tracking)",
  "Example:",
  "```",
  "- [ ] TASK-001: Set up project structure",
  "- [ ] TASK-002: Create authentication service",
  "- [ ] TASK-003: Build login UI component",
  "```",
  "",
  "### Output 2: Detailed Task Files",
  "Create individual task files in: {{readyToBuildPath}}/",
  "Filename pattern: feature-name-task-id.md",
  "Include full task details (ID, title, description, acceptance criteria, etc.)",
  "",
  "### Output 3: Traceability Matrix",
  "Create: {{readyToBuildPath}}/traceability.md",
  "Show which tasks implement which requirements from PRD and Design.",
  "Ensure 100% coverage of PRD features.",
  "",
  "## CRITICAL RULES",
  "",
  "- Do NOT invent features beyond what's documented in PRD and Design",
  "- Do NOT skip important tasks (infrastructure, testing, error handling)",
  "- DO create explicit 'Open Question' tasks for any ambiguities",
  "- DO reference specific page/section from source docs in each task",
  "- DO ensure tasks form a coherent, implementable roadmap",
  "- DO validate that all features from PRD are covered"
].join("\n");

const DEFAULT_CODE_PROMPT_TEMPLATE = [
  "You are responsible for implementing code tasks for Scaffold based on the planning documents and task backlog.",
  "",
  "## CONTEXT & PLANNING DOCUMENTS",
  "",
  "Before implementing, thoroughly read these planning documents to understand the full context:",
  "",
  "### Knowledge Base",
  "Path: {{knowledgeBaseIndexPath}}",
  "Contains: Technical constraints, design patterns, architectural decisions, and domain knowledge.",
  "Action: Review all constraints and make sure your implementation respects them.",
  "",
  "### Product Requirements Document",
  "Path: {{prdIndexPath}}",
  "Contains: Features, user stories, requirements, and success criteria.",
  "Action: Verify each task aligns with PRD and implements exactly what's specified.",
  "",
  "### Design System & UI/UX",
  "Path: {{designIndexPath}}",
  "Contains: Component designs, layouts, interaction patterns, and visual specifications.",
  "Action: Ensure UI matches design exactly. Follow design system for spacing, colors, typography.",
  "",
  "### Engineering Plan",
  "Path: {{engineeringPlanIndexPath}}",
  "Contains: Architecture, tech stack, module structure, integration points, and implementation patterns.",
  "Action: Follow the architectural decisions. Integrate components as specified. Use recommended patterns.",
  "",
  "### Task Plan & Backlog",
  "Path: {{readyToBuildPath}}/backlog.md",
  "Contains: Master list of tasks with checkboxes for progress tracking.",
  "Action: Look at this to understand task priorities and dependencies.",
  "",
  "### Detailed Task Files",
  "Path: {{readyToBuildPath}}/*.md (individual task files)",
  "Contains: Full task details, acceptance criteria, and specific requirements.",
  "Action: Read the task file for the task you're implementing. This is your implementation spec.",
  "",
  "## IMPLEMENTATION WORKFLOW",
  "",
  "### Step 1: Select Tasks",
  "- Read {{readyToBuildPath}}/backlog.md",
  "- Identify highest-priority tasks that are NOT checked [ ]",
  "- Check task dependencies - only implement if prerequisites are done",
  "- Pick 1-3 related tasks to work on in this session (avoid context switching)",
  "",
  "### Step 2: Read Task Specification",
  "- Open the detailed task file for each task you're implementing",
  "- Understand: Title, description, context, and acceptance criteria",
  "- Note: Dependencies, files to create/modify, and test requirements",
  "- Ask questions in implementation notes if anything is unclear",
  "",
  "### Step 3: Design Implementation",
  "Before coding, outline your approach:",
  "- How does this task fit into the existing codebase?",
  "- Which files need to be created or modified?",
  "- What dependencies does this need from other tasks?",
  "- How will this be tested?",
  "",
  "### Step 4: Implement Incrementally",
  "- Start with core logic, then add features",
  "- Make small, logical commits (not all code at once)",
  "- Follow the engineering patterns from Engineering Plan",
  "- Follow the design specifications exactly",
  "- Add comments for non-obvious code",
  "",
  "### Step 5: Test & Validate",
  "- Implement tests alongside code (not after)",
  "- Verify all acceptance criteria are met",
  "- Test integration with other completed tasks",
  "- Validate UI matches design specifications",
  "",
  "## CODE ORGANIZATION",
  "",
  "All code lives in the workspace root (outside .scaffold/).",
  "",
  "Project Structure:",
  "- Source code in appropriate directories (e.g., src/, components/, services/)",
  "- Tests alongside source code or in dedicated test/ directory",
  "- Configuration files at project root",
  "- Keep .scaffold/ folder for planning docs only - NO CODE HERE",
  "",
  "## IMPLEMENTATION REQUIREMENTS",
  "",
  "### Code Quality",
  "- Follow the tech stack and patterns defined in Engineering Plan",
  "- Use consistent naming conventions",
  "- Write clear, self-documenting code",
  "- Add comments for complex logic",
  "- Keep functions/components focused and single-purpose",
  "",
  "### Design Compliance",
  "- UI components must match the Design system exactly",
  "- Use specified colors, fonts, spacing, and component styles",
  "- Implement specified interactions and animations",
  "- Respect accessibility requirements from Design",
  "",
  "### Architecture Compliance",
  "- Follow module structure from Engineering Plan",
  "- Use specified patterns for state management, API calls, etc.",
  "- Integrate with other modules as specified",
  "- Use recommended libraries and tools",
  "",
  "### Testing Strategy",
  "- Write unit tests for logic",
  "- Write integration tests for module interactions",
  "- Write UI tests for user interactions",
  "- Verify all acceptance criteria with tests",
  "",
  "## OUTPUT FORMAT",
  "",
  "Provide a detailed implementation plan:",
  "",
  "### Part 1: Task Analysis",
  "- Which tasks are you implementing?",
  "- What are the key acceptance criteria?",
  "- What dependencies need to be satisfied?",
  "- Any ambiguities or open questions?",
  "",
  "### Part 2: Implementation Plan",
  "- File-by-file breakdown of what needs to be created/modified",
  "- Order of implementation (what to code first)",
  "- How this integrates with existing code",
  "- Testing approach for each task",
  "",
  "### Part 3: Code Implementation",
  "- Show all code changes needed",
  "- Include file paths and full content",
  "- Add explanatory comments",
  "- Show how files integrate together",
  "",
  "### Part 4: Validation",
  "- List validation steps to verify implementation",
  "- How to test each acceptance criterion",
  "- Expected test results",
  "- Manual testing steps if applicable",
  "",
  "### Part 5: Next Steps",
  "- Tasks completed in this session",
  "- How to mark tasks as done in Task Plan backlog",
  "- Recommended tasks to work on next",
  "",
  "## CRITICAL RULES",
  "",
  "- DO: Implement EXACTLY what the task specifies, not more",
  "- DO: Reference design specs for every UI element",
  "- DO: Follow architecture patterns from Engineering Plan",
  "- DO: Write tests as you code, not after",
  "- DO: Keep changes focused and incremental",
  "- DON'T: Add unplanned features (stick to task scope)",
  "- DON'T: Ignore design system (UI must match Design exactly)",
  "- DON'T: Skip testing or error handling",
  "- DON'T: Create code in .scaffold/ folder",
  "- DON'T: Leave TODOs without implementation plan"
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

    vscode.commands.registerCommand("scaffold.finalizeFile", async (node?: SectionNodeItem) => {
      if (!node || node.isDirectory) {
        return;
      }
      try {
        await storage.finalizeFile(node.section, node.uri);
        refreshAll();
        vscode.window.showInformationMessage(`${path.basename(node.uri.path)} finalized.`);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.createRevision", async (node?: SectionNodeItem) => {
      if (!node || node.isDirectory) {
        return;
      }
      try {
        const newUri = await storage.createFileRevision(node.section, node.uri);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    }),

    vscode.commands.registerCommand("scaffold.markTaskDone", async (node?: SectionNodeItem) => {
      if (!node || node.isDirectory) {
        return;
      }
      try {
        await storage.markTaskDone(node.section, node.uri);
        refreshAll();
        vscode.window.showInformationMessage(`${path.basename(node.uri.path)} marked as done in backlog.`);
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

    vscode.commands.registerCommand("scaffold.generateReadyToBuildPrompt", async () => {
      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("readyToBuildPromptTemplate", DEFAULT_TASK_PLAN_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("readyToBuildPromptOutput", "both");
      const toRelativePath = (uri: vscode.Uri): string =>
        path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri("knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri("prd")),
        designPath: toRelativePath(storage.getSectionRootUri("design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri("engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri("readyToBuild")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri("knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri("prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri("design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri("engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri("readyToBuild"))
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
          ? "Task Plan prompt copied to clipboard and opened in editor."
          : outputMode === "clipboard"
            ? "Task Plan prompt copied to clipboard."
            : "Task Plan prompt opened in editor."
      );
    }),

    vscode.commands.registerCommand("scaffold.generateCodePrompt", async () => {
      const cfg = vscode.workspace.getConfiguration("scaffold", workspaceFolderUri);
      const template = cfg.get<string>("codePromptTemplate", DEFAULT_CODE_PROMPT_TEMPLATE);
      const outputMode = cfg.get<"editor" | "clipboard" | "both">("codePromptOutput", "both");
      const toRelativePath = (uri: vscode.Uri): string =>
        path.relative(workspaceFolderUri.fsPath, uri.fsPath).split(path.sep).join("/");

      const replacements: Record<string, string> = {
        knowledgeBasePath: toRelativePath(storage.getSectionRootUri("knowledgeBase")),
        prdPath: toRelativePath(storage.getSectionRootUri("prd")),
        designPath: toRelativePath(storage.getSectionRootUri("design")),
        engineeringPlanPath: toRelativePath(storage.getSectionRootUri("engineeringPlan")),
        readyToBuildPath: toRelativePath(storage.getSectionRootUri("readyToBuild")),
        knowledgeBaseIndexPath: toRelativePath(storage.getSectionIndexUri("knowledgeBase")),
        prdIndexPath: toRelativePath(storage.getSectionIndexUri("prd")),
        designIndexPath: toRelativePath(storage.getSectionIndexUri("design")),
        engineeringPlanIndexPath: toRelativePath(storage.getSectionIndexUri("engineeringPlan")),
        readyToBuildIndexPath: toRelativePath(storage.getSectionIndexUri("readyToBuild"))
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

    vscode.commands.registerCommand("scaffold.createReadyToBuildFile", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Enter task file name" });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({ prompt: "Enter short description (optional)" });
      try {
        const newUri = await storage.createSectionFile("readyToBuild", "", name, description);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
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
}

export function deactivate(): void {
  // no-op
}
