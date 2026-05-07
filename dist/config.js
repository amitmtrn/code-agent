"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const configSchema = zod_1.z.object({
    REPLICATE_API_TOKEN: zod_1.z.string().optional(),
    OLLAMA_BASE_URL: zod_1.z.string().default('http://localhost:11434'),
    DEFAULT_PROVIDER: zod_1.z.enum(['ollama', 'replicate']).default('ollama'),
    DEFAULT_MODEL: zod_1.z.string().default('llama3'),
    DEEP_THINKING: zod_1.z.preprocess((val) => val === 'true', zod_1.z.boolean()).default(false),
    MAX_THINKING_LOOPS: zod_1.z.preprocess((val) => val ? parseInt(val, 10) : undefined, zod_1.z.number()).default(2),
});
function loadConfig() {
    const result = configSchema.safeParse(process.env);
    if (!result.success) {
        console.error('❌ Invalid configuration:', result.error.format());
        process.exit(1);
    }
    return result.data;
}
exports.config = loadConfig();
