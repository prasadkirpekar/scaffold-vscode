# Scaffold: Local-First Project Planning and Execution in VS Code

Scaffold is a VS Code extension for local-first software planning workflows. It helps individual developers organize workspace knowledge, map requirements clearly, and move from discovery to implementation with gated sections:

- Knowledge Base
- Product Requirement Document (PRD)
- Design
- Engineering Plan
- Ready to Code
- Code

All content is stored as regular Markdown and JSON files inside your workspace, making it easy to version in Git and edit with any tool.

## Why Scaffold

- Local-first: your docs and workflow state stay in your repository.
- Structured planning: section-by-section workflow with approval gates.
- AI-friendly: map requirements and knowledge so AI coding assistants stay on track.
- GitHub-friendly: plain files, no proprietary data format.

## Works With Your AI Stack

Scaffold is model-agnostic. You can pair it with GitHub Copilot, Gemini, Claude, and other AI coding assistants.

- Flexible by design: choose your preferred assistant for each stage of planning and implementation.
- Customizable prompts: tune templates for Ready-to-Code and Code to match your workflow.
- Context that stays grounded: Scaffold keeps project requirements, decisions, and knowledge in your workspace so AI outputs stay aligned with real project context.
- Better continuity: move between tools without losing structure because your source of truth remains local files in your repository.

## Section Workflow

Scaffold organizes planning into sequential sections:

1. Knowledge Base
2. Product Requirement Document
3. Design
4. Engineering Plan
5. Ready to Code
6. Code

Each section can contain nested files and folders. Gate approvals help enforce readiness before progressing.

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

Break requirements into actionable technical plans and implementation units.

![Add engineering plan step 1](assets/add-engineering-plan.png)

6. **Add Engineering Plan (Step 2)**

Expand the plan with detailed tasks, ownership, and sequencing.

![Add engineering plan step 2](assets/add-engineering-plan-2.png)

7. **Generate Ready-to-Code Task Planning Prompt**

Create an AI-ready prompt from approved sections to produce execution-ready tasks.

![Ready to code prompt generation](assets/ready-to-build-generate-prompt-for-task-planning.png)

8. **Review Generated Ready-to-Code Tasks**

Inspect the generated task list before moving into implementation.

![Generated ready to code tasks](assets/for-ready-to-build-tasks-will-generated.png)

9. **Generate Code Prompt**

Produce a coding prompt aligned with your approved plan so implementation stays on-track.

![Generated coding prompt](assets/generated-prompt-to-give-to-ai-for-code-generation.png)


## Data Layout

By default, Scaffold stores data under:

- `.scaffold/`

Inside `.scaffold/`:

- `sections.json` for section gate states
- `.approvals/` for approval metadata
- `build-index.md` for Code section indexing
- `manual-change-log.md` for Code section manual file operation logs
- `activity.jsonl` for append-only activity tracking
- `sections/knowledge-base/` for Knowledge Base docs
- `sections/prd/` for Product Requirement Document files
- `sections/design/` for Design docs
- `sections/engineering-plan/` for implementation planning docs
- `sections/ready-to-code/` for execution-ready tasks

Code files are created in your workspace root (outside `.scaffold/`) so implementation stays in your project source tree.

## Commands

Key commands exposed by Scaffold:

- Scaffold: Initialize Workspace
- Scaffold: Approve Section
- Scaffold: Approve File
- Scaffold: Generate Ready-to-Code Prompt
- Scaffold: Generate Code Prompt
- Scaffold: Open Code Folder Externally
- Scaffold: Rename
- Scaffold: Delete
- Scaffold: Refresh

## Settings

- `scaffold.gateMode`: `strict` or `flexible`
- `scaffold.dataFolder`: data root folder name (default `.scaffold`)
- `scaffold.readyToBuildPromptTemplate`: template for ready-to-code prompt generation
- `scaffold.readyToBuildPromptOutput`: output target (`editor`, `clipboard`, `both`)
- `scaffold.buildPromptTemplate`: template for code prompt generation
- `scaffold.buildPromptOutput`: output target (`editor`, `clipboard`, `both`)

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
