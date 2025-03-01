import type { CommandDetails } from './models/CommandDetails';
import type * as podmanDesktopApi from '@podman-desktop/api';
import type { SimplifiedSpec } from './models/SimplifiedSpec';

export abstract class KreateApi {
  abstract getCommands(parent?: string): Promise<string[]>;
  abstract getCommandDetails(command: string[]): Promise<CommandDetails>;
  abstract executeCommand(args: string[]): Promise<string>;

  abstract openDialog(options?: podmanDesktopApi.OpenDialogOptions): Promise<podmanDesktopApi.Uri[] | undefined>;

  abstract create(s: string): Promise<void>;

  abstract getSpecFromYamlManifest(content: string, pathInSpec: string[]): Promise<SimplifiedSpec>;
  abstract getPathAtPosition(content: string, position: number): Promise<string[]>;
  abstract getState(): Promise<{ content: string; position: number }>;
}
