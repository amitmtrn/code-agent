"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.normalizeUrl = normalizeUrl;
exports.getOllamaFallbackUrls = getOllamaFallbackUrls;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function normalizeUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `http://${url}`;
    }
    return url;
}
const configSchema = zod_1.z.object({
    REPLICATE_API_TOKEN: zod_1.z.string().optional(),
    OLLAMA_BASE_URL: zod_1.z.preprocess((val) => {
        if (typeof val === 'string') {
            return normalizeUrl(val);
        }
        return val;
    }, zod_1.z.string()).default('http://localhost:11434'),
    DEFAULT_PROVIDER: zod_1.z.enum(['ollama', 'replicate']).default('ollama'),
    DEFAULT_MODEL: zod_1.z.string().default('llama3'),
    DEEP_THINKING: zod_1.z.preprocess((val) => val === 'true', zod_1.z.boolean()).default(false),
    MAX_THINKING_LOOPS: zod_1.z.preprocess((val) => val ? parseInt(val, 10) : undefined, zod_1.z.number()).default(5),
});
// Function to get fallback Ollama URLs in case the primary one fails
function getOllamaFallbackUrls(primaryUrl) {
    const fallbacks = [
        primaryUrl,
        'http://localhost:11434',
        'http://127.0.0.1:11434',
        'http://host.docker.internal:11434',
    ];
    // Remove duplicates while preserving order
    return [...new Set(fallbacks)];
}
function loadConfig() {
    const result = configSchema.safeParse(process.env);
    if (!result.success) {
        console.error('❌ Invalid configuration:', result.error.format());
        process.exit(1);
    }
    return result.data;
}
exports.config = loadConfig();
