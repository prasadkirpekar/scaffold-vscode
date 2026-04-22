import * as vscode from "vscode";
import { ProjectMeta } from "../models";
import { ScaffoldStorage } from "../storage";

export class ProjectItem extends vscode.TreeItem {
  public readonly project: ProjectMeta;

  public constructor(project: ProjectMeta, isActive: boolean) {
    super(project.name, vscode.TreeItemCollapsibleState.None);
    this.project = project;
    this.id = `project:${project.id}`;
    this.description = isActive ? "active" : project.status;
    this.contextValue = "project";
    this.command = {
      command: "scaffold.setActiveProject",
      title: "Set Active Project",
      arguments: [project.id]
    };
    this.iconPath = new vscode.ThemeIcon(isActive ? "target" : "folder");
  }
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private activeProjectId: string | null = null;

  public constructor(private readonly storage: ScaffoldStorage) {}

  public setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
    this.refresh();
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: ProjectItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<ProjectItem[]> {
    const projects = await this.storage.listProjects();
    return projects.map((project) => new ProjectItem(project, project.id === this.activeProjectId));
  }
}
