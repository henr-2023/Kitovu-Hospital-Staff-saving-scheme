const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = ["index.html", "style.css", "app.js"];
const demoBootstrap = '<script>window.KITOVU_APP_MODE = "demo";</script>\n<script src="app.js"></script>';

for (const outputName of ["www", "www-demo"]) {
  const output = path.join(root, outputName);
  fs.mkdirSync(output, { recursive: true });

  for (const asset of assets) {
    const source = path.join(root, asset);
    let content = fs.readFileSync(source, "utf8");
    if (outputName === "www-demo" && asset === "index.html") {
      const scriptTag = '<script src="app.js"></script>';
      if (!content.includes(scriptTag)) {
        throw new Error(`Could not find the app script tag in ${source}.`);
      }
      content = content.replace(scriptTag, demoBootstrap);
    }
    fs.writeFileSync(path.join(output, asset), content, "utf8");
  }
}

console.log("Built web application in www/ and demo application in www-demo/.");
