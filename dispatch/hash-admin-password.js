"use strict";
// Read from private stdin; never pass the password as a command-line argument.
const fs = require("node:fs");
const crypto = require("node:crypto");
const password = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (password.length < 12 || password.length > 128) {
  console.error("Password must contain 12–128 characters.");
  process.exitCode = 1;
} else {
  const salt = crypto.randomBytes(16).toString("hex");
  crypto.scrypt(password, salt, 64, (error, key) => {
    if (error) { console.error("Could not generate password hash."); process.exitCode = 1; return; }
    process.stdout.write(salt + ":" + key.toString("hex") + "\n");
  });
}
