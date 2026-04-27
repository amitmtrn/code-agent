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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const fs_1 = require("../tools/fs");
const registry_1 = require("../tools/registry");
const core_1 = require("../agent/core");
async function testTools() {
    console.log('--- Testing Tools ---');
    const testDir = path.join(process.cwd(), 'test-temp');
    const testFile = path.join(testDir, 'test.txt');
    const content = 'Hello World';
    try {
        // 1. write_file
        const writeResult = await fs_1.writeFileTool.execute({ path: testFile, content });
        if (writeResult.includes('Successfully wrote')) {
            console.log('PASS: write_file tool');
        }
        else {
            console.error('FAIL: write_file tool', writeResult);
            process.exit(1);
        }
        // 2. read_file
        const readResult = await fs_1.readFileTool.execute({ path: testFile });
        if (readResult === content) {
            console.log('PASS: read_file tool');
        }
        else {
            console.error('FAIL: read_file tool. Expected:', content, 'Got:', readResult);
            process.exit(1);
        }
        // 3. list_files
        const listResult = await fs_1.listFilesTool.execute({ path: testDir });
        if (listResult.includes('test.txt')) {
            console.log('PASS: list_files tool');
        }
        else {
            console.error('FAIL: list_files tool. Result:', listResult);
            process.exit(1);
        }
    }
    finally {
        await fs.rm(testDir, { recursive: true, force: true });
    }
}
async function testRegistry() {
    console.log('--- Testing Registry ---');
    const localRegistry = new registry_1.ToolRegistry();
    const dummyTool = {
        definition: {
            name: 'dummy',
            description: 'A dummy tool',
            parameters: { type: 'object', properties: { arg: { type: 'string' } } },
        },
        async execute({ arg }) {
            return `received: ${arg}`;
        },
    };
    localRegistry.register(dummyTool);
    // 1. Valid execution
    const result = await localRegistry.execute('dummy', JSON.stringify({ arg: 'hello' }));
    if (result === 'received: hello') {
        console.log('PASS: registry valid execution');
    }
    else {
        console.error('FAIL: registry valid execution. Got:', result);
        process.exit(1);
    }
    // 2. Invalid JSON
    try {
        await localRegistry.execute('dummy', '{ invalid json }');
        console.error('FAIL: registry invalid JSON did not throw');
        process.exit(1);
    }
    catch (e) {
        if (e.message.includes('Failed to parse arguments')) {
            console.log('PASS: registry invalid JSON throw');
        }
        else {
            console.error('FAIL: registry invalid JSON threw wrong error', e.message);
            process.exit(1);
        }
    }
}
class MockProvider {
    constructor() {
        this.turn = 0;
        this.calls = 0;
    }
    async chat(options) {
        this.calls++;
        this.turn++;
        if (this.turn === 1) {
            return {
                message: { role: 'assistant', content: 'Let me write a file.' },
                toolCalls: [
                    {
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: 'write_file',
                            arguments: JSON.stringify({ path: 'test-temp/loop.txt', content: 'loop content' }),
                        },
                    },
                ],
            };
        }
        else {
            return {
                message: { role: 'assistant', content: 'Done writing.' },
            };
        }
    }
}
async function testAgentLoop() {
    console.log('--- Testing Agent Loop ---');
    const mockProvider = new MockProvider();
    const agent = new core_1.Agent(mockProvider, 'mock-model');
    // Register necessary tools in the global registry since Agent uses it
    registry_1.registry.register(fs_1.writeFileTool);
    const testDir = path.join(process.cwd(), 'test-temp');
    await fs.mkdir(testDir, { recursive: true });
    try {
        await agent.chat('Write a file please');
        if (mockProvider.calls === 2) {
            console.log('PASS: agent loop iteration count');
        }
        else {
            console.error('FAIL: agent loop iteration count. Expected 2, Got:', mockProvider.calls);
            process.exit(1);
        }
        const fileContent = await fs.readFile(path.join(testDir, 'loop.txt'), 'utf-8');
        if (fileContent === 'loop content') {
            console.log('PASS: agent loop side effect (file written)');
        }
        else {
            console.error('FAIL: agent loop side effect. Got:', fileContent);
            process.exit(1);
        }
    }
    finally {
        await fs.rm(testDir, { recursive: true, force: true });
    }
}
async function runAll() {
    await testTools();
    await testRegistry();
    await testAgentLoop();
}
runAll().catch(e => {
    console.error('Unexpected error during tests:', e);
    process.exit(1);
});
