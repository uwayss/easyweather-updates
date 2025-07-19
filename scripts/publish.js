const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const ExpoConfig = require("@expo/config");

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
  channel: {
    alias: "c",
    type: "string",
    demandOption: true,
    choices: ["production", "beta"],
    describe: "The update channel to publish to.",
  },
}).argv;

function publish() {
  const { projectPath, runtimeVersion, channel } = argv;

  if (!fs.existsSync(projectPath)) {
    console.error(`Error: Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const projectDir = path.resolve(projectPath);
  const updatesRepoDir = path.resolve(__dirname, "..");

  console.log(`Publishing update for project: ${projectDir}`);
  console.log(`Platform: android`);
  console.log(`Runtime Version: ${runtimeVersion}`);
  console.log(`Channel: ${channel}`);

  console.log('\nRunning "npx expo export" for Android...');
  execSync("npx expo export -p android", { cwd: projectDir, stdio: "inherit" });

  const exportDistPath = path.join(projectDir, "dist");
  if (!fs.existsSync(exportDistPath)) {
    console.error(
      `Error: "dist" folder not found after export. Check for errors above.`
    );
    process.exit(1);
  }

  const timestamp = Date.now();
  const updateDirectory = path.join(
    updatesRepoDir,
    "updates",
    runtimeVersion,
    channel,
    String(timestamp)
  );

  console.log(`\nCreating update directory: ${updateDirectory}`);
  fs.ensureDirSync(updateDirectory);

  console.log(
    `Copying exported files from ${exportDistPath} to ${updateDirectory}`
  );
  fs.copySync(exportDistPath, updateDirectory);

  const metadataPath = path.join(updateDirectory, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    console.log(
      "Sanitizing paths in metadata.json for platform compatibility..."
    );
    const metadata = fs.readJsonSync(metadataPath);
    metadata.fileMetadata.android.bundle =
      metadata.fileMetadata.android.bundle.replace(/\\/g, "/");
    metadata.fileMetadata.android.assets.forEach((asset) => {
      asset.path = asset.path.replace(/\\/g, "/");
    });
    fs.writeJsonSync(metadataPath, metadata, { spaces: 2 });
  }

  console.log("Extracting public Expo config...");
  const { exp } = ExpoConfig.getConfig(projectDir, {
    skipSDKVersionRequirement: true,
    isPublicConfig: true,
  });
  const expoConfigPath = path.join(updateDirectory, "expoConfig.json");
  fs.writeJsonSync(expoConfigPath, exp, { spaces: 2 });
  console.log(`Saved public config to ${expoConfigPath}`);

  console.log("\nCommitting and pushing changes to this repository...");
  const gitOptions = { cwd: updatesRepoDir, stdio: "inherit" };
  execSync(`git config user.name "OTA Publish Script"`, gitOptions);
  execSync(`git config user.email "bot@expo.dev"`, gitOptions);
  execSync("git add .", gitOptions);
  execSync(
    `git commit -m "Publish [${channel}] update for runtime ${runtimeVersion} at ${timestamp}"`,
    gitOptions
  );
  execSync("git push", gitOptions);

  console.log(
    `\n✅ Publish complete! The [${channel}] update is live in the GitHub repository.`
  );
}

publish();
