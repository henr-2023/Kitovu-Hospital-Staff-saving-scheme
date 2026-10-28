const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const androidProject = path.join(root, "android");
const demoProject = path.join(root, "android-demo");
const marker = path.join(demoProject, ".kitovu-demo-platform");
const config = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
const gradleFile = path.join(demoProject, "app", "build.gradle");
const stringsFile = path.join(demoProject, "app", "src", "main", "res", "values", "strings.xml");

if (!fs.existsSync(path.join(androidProject, "gradlew.bat"))) {
  throw new Error("Android project is missing. Run npm run android:init first.");
}

if (fs.existsSync(demoProject) && !fs.existsSync(marker)) {
  throw new Error("android-demo already exists and is not a generated demo project; move it before continuing.");
}

fs.cpSync(androidProject, demoProject, {
  recursive: true,
  force: true,
  filter: (source) => !source.split(path.sep).some((part) =>
    part === ".gradle" || part === "build" || part === "captures"
  )
});
fs.writeFileSync(marker, "Generated from the Android project for the Kitovu demo app.\n", "utf8");

let gradle = fs.readFileSync(gradleFile, "utf8");
const applicationId = /(applicationId\s*=?\s*["'])[^"']+(["'])/;
const match = gradle.match(applicationId);
if (!match || match[0] !== match[1] + config.appId + match[2]) {
  throw new Error(`Could not find the configured application ID (${config.appId}) in ${gradleFile}.`);
}
gradle = gradle.replace(applicationId, `$1${config.appId}.demo$2`);
fs.writeFileSync(gradleFile, gradle, "utf8");

let strings = fs.readFileSync(stringsFile, "utf8");
const appName = /(<string\s+name="app_name">)[^<]*(<\/string>)/;
if (!appName.test(strings)) {
  throw new Error(`Could not find app_name in ${stringsFile}.`);
}
strings = strings.replace(appName, "$1Kitovu Staff Saving Scheme Demo$2");
fs.writeFileSync(stringsFile, strings, "utf8");

const webAssets = path.join(demoProject, "app", "src", "main", "assets", "public");
fs.mkdirSync(webAssets, { recursive: true });
for (const asset of ["index.html", "style.css", "app.js"]) {
  fs.copyFileSync(path.join(root, "www-demo", asset), path.join(webAssets, asset));
}

console.log("Prepared the separate Android demo project with demo-only web assets and app ID.");
