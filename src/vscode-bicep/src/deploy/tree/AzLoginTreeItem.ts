// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as semver from "semver";
import { commands, Disposable, Extension, extensions } from "vscode";

import {
  AzExtParentTreeItem,
  AzExtTreeItem,
  GenericTreeItem,
  IActionContext,
  registerEvent,
} from "@microsoft/vscode-azext-utils";

import { localize } from "../../utils/localize";
import { AzureAccount, AzureLoginStatus } from "../azure-account";
import { GenericAzExtTreeItem } from "./GenericAzExtTreeItem";

const signInLabel: string = localize("signInLabel", "Sign in to Azure...");
const createAccountLabel: string = localize(
  "createAccountLabel",
  "Create a Free Azure Account..."
);
const signInCommandId = "azure-account.login";
const createAccountCommandId = "azure-account.createAccount";
const azureAccountExtensionId = "ms-vscode.azure-account";
const extensionOpenCommand = "extension.open";

type AzureAccountResult = AzureAccount | "notInstalled" | "needsUpdate";
const minAccountExtensionVersion = "0.9.0";

// Inspired from https://github.com/microsoft/vscode-azuretools/blob/main/azure/src/tree/AzureAccountTreeItemBase.ts,
// without - list all subscription support
export class AzLoginTreeItem extends AzExtParentTreeItem {
  public static contextValue = "azureextensionui.azureAccount";
  public readonly contextValue: string = AzLoginTreeItem.contextValue;
  public readonly label: string = "Azure";
  public childTypeLabel: string = localize("subscription", "subscription");
  public autoSelectInTreeItemPicker = true;
  public disposables: Disposable[] = [];
  public suppressMaskLabel = true;

  private _azureAccountTask: Promise<AzureAccountResult>;
  private _testAccount: AzureAccount | undefined;

  constructor(parent?: AzExtParentTreeItem, testAccount?: AzureAccount) {
    super(parent);
    this._testAccount = testAccount;
    this._azureAccountTask = this.loadAzureAccount(testAccount);
  }

  public dispose(): void {
    Disposable.from(...this.disposables).dispose();
  }

  public hasMoreChildrenImpl(): boolean {
    return false;
  }

  public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
    let azureAccount: AzureAccountResult = await this._azureAccountTask;
    if (typeof azureAccount === "string") {
      // Refresh the AzureAccount, to handle Azure account extension installation after the previous refresh
      this._azureAccountTask = this.loadAzureAccount(this._testAccount);
      azureAccount = await this._azureAccountTask;
    }

    if (typeof azureAccount === "string") {
      const label: string =
        azureAccount === "notInstalled"
          ? localize(
              "installAzureAccount",
              "Install Azure Account Extension and try deploy again..."
            )
          : localize(
              "updateAzureAccount",
              'Update Azure Account Extension to at least version "{0}"...',
              minAccountExtensionVersion
            );
      const result: AzExtTreeItem = new GenericTreeItem(this, {
        label,
        commandId: extensionOpenCommand,
        contextValue: "azureAccount" + azureAccount,
        includeInTreeItemPicker: true,
      });
      result.commandArgs = [azureAccountExtensionId];
      return [result];
    }

    const contextValue = "azureCommand";
    if (
      azureAccount.status === "Initializing" ||
      azureAccount.status === "LoggingIn"
    ) {
      return [
        new GenericTreeItem(this, {
          label:
            azureAccount.status === "Initializing"
              ? localize("loadingTreeItem", "Loading...")
              : localize("signingIn", "Waiting for Azure sign-in..."),
          commandId: signInCommandId,
          contextValue,
          id: signInCommandId,
        }),
      ];
    } else if (azureAccount.status === "LoggedOut") {
      return [
        new GenericTreeItem(this, {
          label: signInLabel,
          commandId: signInCommandId,
          contextValue,
          id: signInCommandId,
          includeInTreeItemPicker: true,
        }),
        new GenericTreeItem(this, {
          label: createAccountLabel,
          commandId: createAccountCommandId,
          contextValue,
          id: createAccountCommandId,
          includeInTreeItemPicker: true,
        }),
      ];
    }

    return [new GenericAzExtTreeItem(this, "", "")];
  }

  public async getIsLoggedIn(): Promise<boolean> {
    const azureAccount: AzureAccountResult = await this._azureAccountTask;
    return (
      typeof azureAccount !== "string" && azureAccount.status === "LoggedIn"
    );
  }

  public compareChildrenImpl(
    item1: AzExtTreeItem,
    item2: AzExtTreeItem
  ): number {
    if (item1 instanceof GenericTreeItem && item2 instanceof GenericTreeItem) {
      return 0; // already sorted
    } else {
      return super.compareChildrenImpl(item1, item2);
    }
  }

  private async loadAzureAccount(
    azureAccount: AzureAccount | undefined
  ): Promise<AzureAccountResult> {
    if (!azureAccount) {
      const extension: Extension<AzureAccount> | undefined =
        extensions.getExtension<AzureAccount>(azureAccountExtensionId);
      if (extension) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (
            semver.lt(extension.packageJSON.version, minAccountExtensionVersion)
          ) {
            return "needsUpdate";
          }
        } catch {
          // ignore and assume extension is up to date
        }

        if (!extension.isActive) {
          await extension.activate();
        }

        azureAccount = extension.exports;
      }
    }

    if (azureAccount) {
      registerEvent(
        "azureAccount.onStatusChanged",
        azureAccount.onStatusChanged,
        async (context: IActionContext, status: AzureLoginStatus) => {
          context.errorHandling.suppressDisplay = true;
          // Ignore status change to 'LoggedIn' and wait for the 'onFiltersChanged' event to fire instead
          // (so that the tree stays in 'Loading...' state until the filters are actually ready)
          if (status !== "LoggedIn") {
            await this.refresh(context);
          }
        }
      );
      await commands.executeCommand(
        "setContext",
        "isAzureAccountInstalled",
        true
      );
      return azureAccount;
    } else {
      return "notInstalled";
    }
  }
}
