import {
  existsSync,
  ensureDirSync,
  copySync,
  readJsonSync,
  writeJsonSync,
} from "fs-extra";
import { resolve, join } from "path";
import { execSync } from "child_process";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getConfig } from "@expo/config";

const argv = yargs(hideBin(process.argv)).options({
  "project-path": {
    alias: "p",
    type: "string",
    demandOption: true,
    describe: "Path to the Expo project to publish (e.g., ../easyweather).",
  },
  "runtime-version": {
    alias: "r",
    type: "string",
    demandOption: true,
    describe: "The runtime version for the update.",
  },
}).argv;

function publish() {
  const { projectPath, runtimeVersion } = argv;

  if (!existsSync(projectPath)) {
    console.error(`Error: Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const projectDir = resolve(projectPath);
  const updatesRepoDir = resolve(__dirname, "..");

  console.log(`Publishing update for project: ${projectDir}`);
  console.log(`Platform: android`);
  console.log(`Runtime Version: ${runtimeVersion}`);

  console.log('\nRunning "npx expo export" for Android...');
  execSync("npx expo export -p android", { cwd: projectDir, stdio: "inherit" });

  const exportDistPath = join(projectDir, "dist");
  if (!existsSync(exportDistPath)) {
    console.error(
      `Error: "dist" folder not found after export. Check for errors above.`
    );
    process.exit(1);
  }

  const timestamp = Date.now();
  const updateDirectory = join(
    updatesRepoDir,
    "updates",
    runtimeVersion,
    String(timestamp)
  );

  console.log(`\nCreating update directory: ${updateDirectory}`);
  ensureDirSync(updateDirectory);

  console.log(
    `Copying exported files from ${exportDistPath} to ${updateDirectory}`
  );
  copySync(exportDistPath, updateDirectory);

  const metadataPath = join(updateDirectory, "metadata.json");
  if (existsSync(metadataPath)) {
    console.log(
      "Sanitizing paths in metadata.json for platform compatibility..."
    );
    const metadata = readJsonSync(metadataPath);
    metadata.fileMetadata.android.bundle =
      metadata.fileMetadata.android.bundle.replace(/\\/g, "/");
    metadata.fileMetadata.android.assets.forEach((asset) => {
      asset.path = asset.path.replace(/\\/g, "/");
    });
    writeJsonSync(metadataPath, metadata, { spaces: 2 });
  }

  console.log("Extracting public Expo config...");
  const { exp } = getConfig(projectDir, {
    skipSDKVersionRequirement: true,
    isPublicConfig: true,
  });
  const expoConfigPath = join(updateDirectory, "expoConfig.json");
  writeJsonSync(expoConfigPath, exp, { spaces: 2 });
  console.log(`Saved public config to ${expoConfigPath}`);

  console.log("\nCommitting and pushing changes to this repository...");
  const gitOptions = { cwd: updatesRepoDir, stdio: "inherit" };
  execSync(`git config user.name "OTA Publish Script"`, gitOptions);
  execSync(`git config user.email "bot@expo.dev"`, gitOptions);
  execSync("git add .", gitOptions);
  execSync(
    `git commit -m "Publish update for runtime ${runtimeVersion} at ${timestamp}"`,
    gitOptions
  );
  execSync("git push", gitOptions);

  console.log(
    "\n✅ Publish complete! The update is live in the GitHub repository."
  );
}

publish();
