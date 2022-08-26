// Lints examples, currently this includes:
// - making sure each example in /examples has a package.json describing how it can be run (i.e. by CI)
//    - making sure the name in the package.json matches @examples/<language>-<name_of_example>-<any-sub-directory>
//      (^ this ensures that we have clear names when we start measuring the build and synth performance of examples)
// - ... more as we might need it

var fs = require("fs");
var path = require("path");
var exec = require("child_process").execSync;

const CDKTF_CONFIG_FILE = "cdktf.json"; // used to detect directories with a CDKTF example

function getChildDirs(rootDir) {
  const all = fs.readdirSync(rootDir);
  return all.filter((file) =>
    fs.statSync(path.resolve(rootDir, file)).isDirectory()
  );
}

function isCdktfOrExampleProject(dir) {
  return fs
    .readdirSync(dir)
    .some((file) => file === CDKTF_CONFIG_FILE || file === "package.json");
}

// decent into all dirs, stopping at either dirs with a cdktf.json or a package.json
function collectCdktfOrExampleProjectDirs(root) {
  const projectDirs = [];

  if (isCdktfOrExampleProject(root)) {
    projectDirs.push(root);
  } else {
    const childDirs = getChildDirs(root);
    projectDirs.push(
      ...childDirs.flatMap((childDir) =>
        collectCdktfOrExampleProjectDirs(path.resolve(root, childDir))
      )
    );
  }

  return projectDirs;
}

const REPO_ROOT = path.resolve(__dirname, "..");

// e.g. ['examples/typescript/docker', 'examples/typescript/google']
const exampleProjects = collectCdktfOrExampleProjectDirs(
  path.resolve(REPO_ROOT, "examples")
).map((p) => p.replace(REPO_ROOT + "/", ""));

// e.g. [{ name: '@examples/typescript-google-cloud-run', location: '/Users/ansgar/projects/hashicorp/terraform-cdk/examples/typescript/google-cloudrun'}]
// (also includes version and private for each package)
const knownToLerna = JSON.parse(exec("npx lerna list --all --json").toString());

let failedCheck = false;
exampleProjects.forEach((example) => {
  const expectedPackageName = `@examples/${example
    .replace("examples/", "")
    .replace(/\//g, "-")}`;
  const packageJsonPath = path.resolve(REPO_ROOT, example, "package.json");

  const hasPackageJson = fs.existsSync(packageJsonPath);

  if (!hasPackageJson) {
    failedCheck = true;
    console.error(
      `Error: Found example in directory '${example}' but there is no package.json.`
    );
    return;
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));

  if (packageJson.name !== expectedPackageName) {
    failedCheck = true;
    console.error(
      `Error: Found example in directory '${example}' but the name in the package.json is not "${expectedPackageName}" (it is "${packageJson.name}")`
    );
    return;
  }

  const lernaEntry = knownToLerna.find((e) => e.name === expectedPackageName);

  if (!lernaEntry) {
    console.error(
      `Error: Found example in directory '${example}' with a package.json and the right name but "npx lerna list --all" does not seem to recognize that packge.`
    );
    failedCheck = true;
    return;
  }
});

if (failedCheck) {
  console.log(
    "Linting the examples failed. One or more examples don't have a package.json with the right name. See stderr for more information about them."
  );
  process.exit(1);
} else {
  console.log("Linting the examples succeeded.");
}
