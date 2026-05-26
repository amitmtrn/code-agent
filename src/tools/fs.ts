import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool } from './registry';

export const readFileTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to read' },
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
      return `Error reading file: ${e.message}`;
    }
  },
};

export const writeFileTool: Tool = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to write' },
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
      return `Error writing file: ${e.message}`;
    }
  },
};

export const createDirectoryTool: Tool = {
  definition: {
    name: 'create_directory',
    description: 'Create a directory (recursive: parents are created as needed). Idempotent — succeeds even if the directory already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path to create' },
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
      return `Error creating directory: ${e.message}`;
    }
  },
};

export const listFilesTool: Tool = {
  definition: {
    name: 'list_files',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory to list', default: '.' },
      },
    },
    readOnly: true,
  },
  async execute({ path: dirPath = '.' }) {
    try {
      const files = await fs.readdir(dirPath);
      return files.join('\n');
    } catch (e: any) {
      return `Error listing files: ${e.message}`;
    }
  },
};
