import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool } from './registry';

/**
 * Smaller open-weight models (gemma3 in particular) routinely lose track of
 * which directory their paths are resolving against — they emit `Read index.js`
 * expecting a subdirectory's file, get a bare ENOENT, and start hallucinating.
 * Each error here echoes the absolute path we actually tried, plus the cwd
 * the relative path resolved against, so the model can correct itself in the
 * next turn instead of spiralling.
 */
function describeFsError(e: any, kind: 'read' | 'write' | 'create' | 'list', requestedPath: string): string {
  const absolute = path.isAbsolute(requestedPath)
    ? requestedPath
    : path.resolve(process.cwd(), requestedPath);
  if (e?.code === 'ENOENT') {
    return `Error ${kind === 'read' ? 'reading' : kind === 'write' ? 'writing' : kind === 'create' ? 'creating' : 'listing'} ${requestedPath}: file or directory does not exist. Looked at: ${absolute} (relative paths resolve against cwd: ${process.cwd()}). If you meant a path inside a subdirectory, include it (e.g. \`backend/index.js\`), or run \`list_files\` on the parent first to confirm the layout.`;
  }
  if (e?.code === 'EISDIR' && kind === 'read') {
    return `Error reading ${requestedPath}: that path is a directory, not a file (resolved to ${absolute}). Use list_files to see its contents.`;
  }
  if (e?.code === 'ENOTDIR' && kind === 'list') {
    return `Error listing ${requestedPath}: that path is a file, not a directory (resolved to ${absolute}). Use read_file instead.`;
  }
  return `Error ${kind === 'read' ? 'reading' : kind === 'write' ? 'writing' : kind === 'create' ? 'creating directory' : 'listing'} ${requestedPath}: ${e.message}`;
}

export const readFileTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file. Paths are resolved relative to the project root unless absolute. `cd` from a previous execute_shell call does NOT carry over here.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to read (relative to the project root, or absolute)' },
      },
      required: ['path'],
    },
    readOnly: true,
  },
  async execute({ path: filePath }) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (e: any) {
      return describeFsError(e, 'read', filePath);
    }
  },
};

export const writeFileTool: Tool = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file. Paths are resolved relative to the project root unless absolute. Parent directories are created automatically. `cd` from a previous execute_shell call does NOT carry over.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to write (relative to the project root, or absolute)' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['path', 'content'],
    },
    readOnly: false,
  },
  async execute({ path: filePath, content }) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (e: any) {
      return describeFsError(e, 'write', filePath);
    }
  },
};

export const createDirectoryTool: Tool = {
  definition: {
    name: 'create_directory',
    description: 'Create a directory (recursive: parents are created as needed). Idempotent — succeeds even if the directory already exists. Paths are resolved relative to the project root unless absolute.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path to create (relative to the project root, or absolute)' },
      },
      required: ['path'],
    },
    readOnly: false,
  },
  async execute({ path: dirPath }) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return `Successfully created directory ${dirPath}`;
    } catch (e: any) {
      return describeFsError(e, 'create', dirPath);
    }
  },
};

export const listFilesTool: Tool = {
  definition: {
    name: 'list_files',
    description: 'List files in a directory. Paths are resolved relative to the project root unless absolute. Use this BEFORE read_file when you are uncertain of the layout.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory to list (relative to the project root, or absolute)', default: '.' },
      },
    },
    readOnly: true,
  },
  async execute({ path: dirPath = '.' }) {
    try {
      const files = await fs.readdir(dirPath);
      return files.join('\n');
    } catch (e: any) {
      return describeFsError(e, 'list', dirPath);
    }
  },
};
