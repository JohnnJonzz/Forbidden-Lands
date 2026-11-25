import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  lstatSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { resolve, join, sep, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
// The caller must stop all writers before copying database + file assets as one snapshot.
export async function backupCampaign(input: {
  database: string;
  output: string;
  assets: Record<string, string>;
  quiesced: boolean;
}) {
  if (!input.quiesced)
    throw Error(
      "Stop the application and confirm --quiesced before backing up database and assets.",
    );
  const requestedOutput = resolve(input.output);
  const canonicalOutput = join(
    realpathSync(dirname(requestedOutput)),
    basename(requestedOutput),
  );
  if (canonicalOutput !== requestedOutput)
    throw Error(
      "Use a canonical backup destination without symlink redirection.",
    );
  const database = realpathSync(input.database),
    output = canonicalOutput,
    sources = { database, ...input.assets };
  for (const [label, path] of Object.entries(sources)) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(label)) throw Error("Invalid asset label.");
    const p = realpathSync(path);
    if (
      lstatSync(path).isSymbolicLink() ||
      output === p ||
      output.startsWith(p + sep)
    )
      throw Error(
        "Backup destination must be new and outside source paths; symlinks are refused.",
      );
  }
  mkdirSync(output, { mode: 0o700 });
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    await backup(db, join(output, "campaign.sqlite"));
  } finally {
    db.close();
  }
  const hashes: Record<string, string> = {};
  function copy(source: string, target: string) {
    const stat = lstatSync(source);
    if (stat.isSymbolicLink())
      throw Error("Asset tree contains a symlink. Backup is incomplete.");
    if (stat.isDirectory()) {
      mkdirSync(target, { mode: 0o700 });
      for (const f of readdirSync(source).sort())
        copy(join(source, f), join(target, f));
    } else if (stat.isFile()) copyFileSync(source, target);
    else throw Error("Unsupported asset type.");
  }
  for (const [name, path] of Object.entries(input.assets))
    copy(path, join(output, name));
  function digest(dir: string) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (lstatSync(path).isDirectory()) digest(path);
      else
        hashes[path.slice(output.length + 1)] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex");
    }
  }
  digest(output);
  const manifest = {
    format: "ravenland-stopped-campaign-backup",
    createdAt: new Date().toISOString(),
    database,
    sources: input.assets,
    quiesced: true,
    hashes,
    restore:
      "With the application stopped, verify hashes, restore campaign.sqlite and each asset directory together, and configure matching storage paths. A Git checkout alone does not restore data.",
  };
  writeFileSync(
    join(output, "backup-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  return manifest;
}
if (process.argv[1]?.endsWith("phase7-backup.ts"))
  void (async () => {
    const args = process.argv.slice(2),
      get = (key: string) => {
        const i = args.indexOf(key);
        if (i < 0 || !args[i + 1]) throw Error("Required " + key);
        return args[i + 1];
      };
    const assets: Record<string, string> = JSON.parse(get("--assets-json"));
    await backupCampaign({
      database: get("--database"),
      output: get("--output"),
      assets,
      quiesced: args.includes("--quiesced"),
    });
    console.log(
      "Stopped database and assets backed up. Review backup-manifest.json before restoring.",
    );
  })().catch((e) => {
    console.error(e instanceof Error ? e.message : "Backup failed");
    process.exitCode = 1;
  });
