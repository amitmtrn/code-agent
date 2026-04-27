"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFilesTool = exports.writeFileTool = exports.readFileTool = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
exports.readFileTool = {
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
    },
    async execute({ path: filePath }) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        }
        catch (e) {
            return `Error reading file: ${e.message}`;
        }
    },
};
exports.writeFileTool = {
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
    },
    async execute({ path: filePath, content }) {
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            return `Successfully wrote to ${filePath}`;
        }
        catch (e) {
            return `Error writing file: ${e.message}`;
        }
    },
};
exports.listFilesTool = {
    definition: {
        name: 'list_files',
        description: 'List files in a directory',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'The directory to list', default: '.' },
            },
        },
    },
    async execute({ path: dirPath = '.' }) {
        try {
            const files = await fs.readdir(dirPath);
            return files.join('\n');
        }
        catch (e) {
            return `Error listing files: ${e.message}`;
        }
    },
};
