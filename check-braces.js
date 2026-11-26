const fs = require("fs");
const code = fs.readFileSync("src/routes/_authenticated/chat.$id.tsx", "utf8");
let depth = 0;
let inString = false;
let sc = null;
for (let i = 0; i < code.length; i++) {
  const ch = code[i];
  if (inString) {
    if (ch === sc && code[i-1] !== "\\") inString = false;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") { inString = true; sc = ch; continue; }
  if (ch === "{") depth++;
  if (ch === "}") depth--;
  if (depth < 0) {
    console.log("Extra closing brace at char", i, "line", code.slice(0,i).split("\n").length);
    process.exit(1);
  }
}
console.log("Final depth:", depth);
if (depth > 0) console.log("Missing", depth, "closing braces");
