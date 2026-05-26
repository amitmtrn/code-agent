// Runs before any other import so dotenv, tools, and the agent all see the
// directory the user actually invoked the command from. npm sets INIT_CWD to
// the caller's directory; npm start --prefix and npx both rely on this.
const initCwd = process.env.INIT_CWD;
if (initCwd && initCwd !== process.cwd()) {
  try {
    process.chdir(initCwd);
  } catch {
    // If INIT_CWD is unreadable, fall back to whatever cwd Node started with.
  }
}
