import * as path from "node:path";
import * as vscode from "vscode";
import { SectionKey } from "../models";
import { ScaffoldStorage } from "../storage";

export class SectionProgressItem extends vscode.TreeItem {
  public readonly section: SectionKey;

  public constructor(
    section: SectionKey,
    label: string,
    finalized: number,
    total: number,
    accessible: boolean
  ) {
    super(`${label} Progress`, vscode.TreeItemCollapsibleState.None);
    this.section = section;
    this.id = `section-progress:${section}`;

    if (!accessible) {
      this.description = "locked · finalize a file in the previous section to unlock";
      this.iconPath = new vscode.ThemeIcon("lock");
      this.contextValue = "section.progress.locked";
    } else if (total === 0) {
      this.description = "no files yet";
      this.iconPath = new vscode.ThemeIcon("circle-outline");
      this.contextValue = "section.progress.empty";
    } else {
      this.description = `${finalized} / ${total} finalized`;
      this.iconPath = new vscode.ThemeIcon(finalized > 0 && finalized === total ? "check-all" : "circle-large-outline");
      this.contextValue = "section.progress.active";
    }
  }
}

export class SectionNodeItem extends vscode.TreeItem {
  public readonly uri: vscode.Uri;
  public readonly section: SectionKey;
  public readonly isDirectory: boolean;

  public constructor(uri: vscode.Uri, section: SectionKey, isDirectory: boolean, finalized: boolean) {
    super(
      path.basename(uri.path),
      isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

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

    if (section === "readyToBuild") {
      if (finalized) {
        this.description = "done";
        this.contextValue = "section.task.done";
        this.iconPath = new vscode.ThemeIcon("check");
      } else {
        this.description = "pending";
        this.contextValue = "section.task.pending";
        this.iconPath = new vscode.ThemeIcon("circle-large-outline");
      }
      return;
    }

    if (finalized) {
      this.description = "finalized";
      this.contextValue = "section.file.finalized";
      this.iconPath = new vscode.ThemeIcon("lock");
    } else {
      this.description = "editing";
      this.contextValue = "section.file.editing";
      this.iconPath = new vscode.ThemeIcon("edit");
    }
  }
}

export type SectionTreeItem = SectionNodeItem;

export class SectionTreeProvider implements vscode.TreeDataProvider<SectionTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SectionTreeItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly storage: ScaffoldStorage,
    private readonly section: SectionKey
  ) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SectionTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SectionTreeItem): Promise<SectionTreeItem[]> {
    if (!element) {
      return this.toNodeItems(this.section);
    }

    if (element instanceof SectionNodeItem && element.isDirectory) {
      return this.toNodeItems(this.section, element.uri);
    }

    return [];
  }

  private async toNodeItems(
    section: SectionKey,
    dirUri?: vscode.Uri
  ): Promise<SectionNodeItem[]> {
    const entries = await this.storage.listSectionEntries(section, dirUri);
    const mapped: SectionNodeItem[] = [];

    for (const entry of entries) {
      const isDirectory = entry.type === vscode.FileType.Directory;
      if (!isDirectory) {
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
