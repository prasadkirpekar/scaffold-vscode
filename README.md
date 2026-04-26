# Scaffold: Local-First Project Planning and Execution in VS Code

Scaffold is a VS Code extension for local-first software planning workflows. It helps individual developers organize workspace knowledge, map requirements clearly, and move from discovery to implementation with structured sections, auto-generated indexes, and AI-ready prompts:

- **Knowledge Base** - capture domain context and constraints
- **Product Requirement Document (PRD)** - define features and user stories
- **UI Design** - specify interactions and visual hierarchy
- **Engineering Plan** - detail technical architecture and approach
- **Task Plan** - break work into executable tasks and track progress

All content is stored as regular Markdown, HTML, and JSON files inside your workspace, making it easy to version in Git and edit with any tool.

## Why Scaffold

- **Local-first**: your docs and workflow state stay in your repository—no cloud dependencies.
- **Structured planning**: sequential 5-section workflow with file-level state tracking for planning docs and one-way pending → done tasks.
- **AI-guided**: detailed, context-aware prompts for task planning and code generation that keep AI assistants aligned with your full planning context.
- **Git-friendly**: plain Markdown and JSON files, version control ready.
- **Incremental refinement**: finalize planning files when ready, create revision stubs that link back to the prior version, and track unfinished work with global editing-count badges across Scaffold views.

## Works With Your AI Stack

Scaffold is model-agnostic. You can pair it with GitHub Copilot, Gemini, Claude, and other AI coding assistants.

- Flexible by design: choose your preferred assistant for each stage of planning and implementation.
- Customizable prompts: tune templates for Task Plan and Code generation to match your workflow.
- Context that stays grounded: Scaffold keeps project requirements, decisions, and knowledge in your workspace so AI outputs stay aligned with real project context.
- Better continuity: move between tools without losing structure because your source of truth remains local files in your repository.

## Section Workflow

Scaffold organizes planning into 5 sequential sections:

1. **Knowledge Base** - capture existing context and constraints
2. **Product Requirement Document** - define features and success criteria
3. **UI Design** - specify user interactions and design decisions
4. **Engineering Plan** - detail implementation approach and architecture
5. **Task Plan** - generate executable tasks and track progress

Each section unlocks when the previous section has at least one finalized file. Planning documents use:
- **Editing** - in progress, editable
- **Finalized** - read-only, versioned with auto-increment (_v2, _v3) stubs for iterations

Task Plan files use:
- **Pending** - in progress, editable
- **Done** - read-only and irreversible once marked complete

Finalized files generate the context for AI prompts, ensuring consistent alignment with your planning decisions.

## Feature Walkthrough

1. **Initialize Workspace**

Initialize Scaffold in your workspace and start planning in a structured workflow.

![Create new project](assets/create-new-project.png)

2. **Create Knowledge Base**

Capture existing domain knowledge and architecture context before writing requirements.

![Create knowledge base](assets/create-knowledgebase.png)

3. **Define Product Requirements**

Write Product Requirement Document files that become the source of truth for implementation.

![Define product requirements](assets/define-product-requirements.png)

4. **Define UI Specifications**

Document UI behavior and constraints to reduce ambiguity before engineering starts.

![Define UI specifications](assets/define-ui-specifications.png)

5. **Add Engineering Plan (Step 1)**

Detail your technical architecture and implementation approach based on requirements and design.

![Add engineering plan](assets/add-engineering-plan.png)

6. **Finalize Planning Documents**

Mark planning files as finalized when ready. This:
- Makes files read-only (prevents accidental edits)
- Unlocks the next section
- Updates index.md for AI context

To iterate on finalized files, use "Create Revision" to auto-generate _v2, _v3 versions with a reference to the previous file at the top.

![Add engineering plan step 2](assets/add-engineering-plan-2.png)

7. **Generate Task Plan Prompt**

Click "Generate Task Plan Prompt" in the Task Plan section toolbar to create an AI-ready prompt. This prompt includes:
- Full context from all previous planning documents (Knowledge Base → Engineering Plan)
- Instructions for breaking work into executable tasks
- Expected output format (master backlog + detailed task files)

Prompt appears in editor/clipboard for use with any AI assistant.

![Task plan prompt generation](assets/ready-to-build-generate-prompt-for-task-planning.png)

8. **Review and Refine Tasks**

Review AI-generated tasks, refine them directly in the `tasks` section, and mark them done when complete.

9. **Generate Code Prompt**

Click "Generate Code Prompt" in the Task Plan section toolbar to create a detailed implementation guide. This includes:
- All planning context for reference
- Current task backlog and priorities
- Step-by-step implementation workflow
- Design/architecture compliance requirements

Use this prompt to guide AI coding assistants in building features.

![Code prompt generation](assets/generated-prompt-to-give-to-ai-for-code-generation.png)

10. **Track Progress**

As tasks are completed:
- Mark tasks as done using "Mark Task Done" action
- Keep task files pending until implementation is complete, then mark them done to make them read-only
- All progress tracked in backlog.md automatically


## Data Layout

By default, Scaffold stores data under:

- `.scaffold/`

Inside `.scaffold/`:

- `sections/knowledge-base/` - Knowledge Base docs
- `sections/prd/` - Product Requirement Document files
- `sections/design/` - UI Design docs  
- `sections/engineering-plan/` - Implementation planning docs
- `sections/tasks/` - Task Plan files and backlog
- `.states/` - file status tracking (editing/finalized) per section
- `index.md` - generated section index per section (auto-updated on file changes)

**Implementation code** lives in your workspace root (outside `.scaffold/`) so all code and dependencies stay in your project source tree and version control.

Each section auto-generates an `index.md` file listing its tracked files and links—useful for AI context in prompts.

The Task Plan section lives under `.scaffold/sections/tasks/`, and prompt generation now targets that folder directly.

## Commands

Key commands exposed by Scaffold:

- Scaffold: Initialize Workspace
- Scaffold: Finalize File (makes planning files read-only)
- Scaffold: Create Revision (creates _v2, _v3, etc. stubs linked to the previous file)
- Scaffold: Mark Task Done (marks a task done, updates backlog, and locks the file)
- Scaffold: Generate Task Plan Prompt (generates detailed prompt to create tasks)
- Scaffold: Generate Code Prompt (generates detailed prompt to implement code)
- Scaffold: Rename
- Scaffold: Delete
- Scaffold: Refresh

## Settings

- `scaffold.dataFolder`: data root folder name (default `.scaffold`)
- `scaffold.tasksPromptTemplate`: template for task plan prompt generation
- `scaffold.tasksPromptOutput`: output target (`editor`, `clipboard`, `both`)
- `scaffold.codePromptTemplate`: template for code implementation prompt generation
- `scaffold.codePromptOutput`: output target (`editor`, `clipboard`, `both`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Compile:

```bash
npm run compile
```

3. Launch Extension Development Host:

- Press `F5` in VS Code

## License

MIT
