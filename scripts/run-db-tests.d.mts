export declare function repoRoot(): string;

export declare function parseArgs(argv: string[]): {
  all: boolean;
  staging: boolean;
  help: boolean;
  files: string[];
};

export declare function listAllSuites(root?: string): string[];

export declare function resolveTargetFiles(
  args: {
    all: boolean;
    staging: boolean;
    help: boolean;
    files: string[];
  },
  root?: string,
): string[];

export declare function validateStagingSuiteSql(
  sql: string,
  filePath: string,
): { ok: boolean; errors: string[] };

export declare function assertStagingGuard(root?: string): { ok: boolean; errors: string[] };

export declare function runViaStaging(files: string[], root: string): number;

export declare function isEntryPoint(entryPath: string | undefined): boolean;
