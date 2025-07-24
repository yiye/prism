# Prism

An intelligent code review assistant powered by Claude 4, featuring advanced system prompt management inspired by qwen-code architecture.

## ✨ Features

- 🤖 **Claude 4 Integration**: Powered by Anthropic's Claude 4 for intelligent code analysis
- 🎯 **Advanced Prompt Management**: Server-side system prompt management with environment override support
- 🔧 **Dynamic Configuration**: Web-based prompt configuration interface
- 📁 **Project-Aware**: Automatic project context detection (Git, dependencies, structure)
- 💬 **Interactive Chat**: Beautiful chat interface for code review discussions
- 🌟 **Cute AI Personality**: Features 玄天仙子·琉璃, a professional yet adorable code review assistant

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Anthropic API Key ([Get one here](https://console.anthropic.com/))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/prism.git
cd prism

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Anthropic API key
```

### Environment Configuration

Create a `.env.local` file with:

```bash
# Required: Claude 4 API Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: System Prompt Override
# Use custom file path:
# CODE_AGENT_SYSTEM_MD=/path/to/your/system.md
# Or use default config file (~/.prism/system.md):
# CODE_AGENT_SYSTEM_MD=true

# Optional: Project Configuration
# PROJECT_ROOT=/path/to/your/project

# Development
NODE_ENV=development
```

### Run the Application

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

Visit [http://localhost:3000](http://localhost:3000) to start using the code review assistant!

## 🎯 System Prompt Management

### Architecture Overview

Our prompt management system is inspired by [qwen-code](https://github.com/QwenLM/qwen-code) but optimized for Claude 4:

- **Layered Prompt Design**: Base prompt + project context + user memory
- **Environment Awareness**: Automatic detection of Git info, project structure, platform
- **File-based Override**: Support for custom system prompts via environment variables
- **Dynamic Context**: Real-time project context injection

### Key Components

#### 1. Prompt Manager (`lib/services/prompt-manager.ts`)

Core functionality modeled after qwen-code's `getCoreSystemPrompt`:

```typescript
// Get system prompt with optional configuration
const systemPrompt = getCoreSystemPrompt({
  userMemory: "Remember user preferences...",
  projectContext: "Current project details...",
  customInstructions: "Additional guidelines..."
});

// Build contextual prompt with environment detection
const contextualPrompt = await buildContextualPrompt(projectPath, config);
```

#### 2. Chat API (`app/api/chat/route.ts`)

Claude 4 integration with automatic prompt injection:

```typescript
// System prompt is automatically injected into every chat session
const messages = formatForClaude(systemPrompt, userMessage);

// Send to Claude 4 API
const response = await fetch(CLAUDE_API_URL, {
  method: 'POST',
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    system: systemPrompt, // 🎯 Key: system prompt injection
    messages: messages.filter(msg => msg.role !== 'system'),
  }),
});
```

#### 3. Configuration Interface (`app/components/prompt-config.tsx`)

Web-based prompt management similar to qwen-code's file-based approach:

- ✅ **Visual Editor**: Edit system prompts with live preview
- ✅ **Environment Display**: Show current project context
- ✅ **Import/Export**: Save and load custom prompts
- ✅ **Reset Functionality**: Restore default prompts
- ✅ **Real-time Updates**: Changes apply immediately

### Usage Examples

#### Basic Chat Usage

```bash
# Visit the main chat interface
http://localhost:3000

# Ask for code review
"Please review this TypeScript component for best practices"
```

#### Advanced Prompt Configuration

```bash
# Visit prompt configuration page
http://localhost:3000/config

# Or use API endpoints directly
GET /api/prompt                    # Get current system prompt
POST /api/prompt                   # Save custom prompt
DELETE /api/prompt                 # Reset to default
```

#### Environment Variable Override

```bash
# Use custom system prompt file
export CODE_AGENT_SYSTEM_MD="/path/to/my-custom-prompt.md"

# Use default config directory
export CODE_AGENT_SYSTEM_MD=true
# Creates ~/.prism/system.md
```

## 🔧 Configuration

### Default System Prompt

The default prompt creates **玄天仙子·琉璃**, a cute but professional code review assistant:

- 🎭 **Personality**: Adorable fairy + expert architect
- 🎯 **Focus**: Clean Code principles + modern best practices  
- 💡 **Style**: Encouraging feedback with technical precision
- 🌟 **Language**: Uses cute expressions like "呢~", "φ(>ω<*)"

### Project Context Auto-Detection

The system automatically detects and includes:

- **Git Information**: Current branch, uncommitted changes
- **Project Structure**: Package.json, dependencies, framework
- **Environment**: Platform, working directory, timestamp
- **File Context**: Currently edited files (when integrated with IDEs)

### Memory & Persistence

Following qwen-code's approach:

- **User Memory**: Persistent preferences and context
- **Session History**: Conversation state management  
- **Custom Instructions**: Project-specific guidelines
- **Context Compression**: Automatic history summarization for long sessions

## 🛠️ Development

### Project Structure

```
prism/
├── app/
│   ├── components/
│   │   ├── chat-interface.tsx      # Main chat UI
│   │   └── prompt-config.tsx       # Prompt management UI
│   ├── api/
│   │   ├── chat/route.ts           # Claude 4 chat endpoint
│   │   └── prompt/route.ts         # Prompt management API
│   └── config/page.tsx             # Configuration page
├── lib/
│   └── services/
│       └── prompt-manager.ts       # Core prompt management
├── qwen-code/                      # Git submodule
└── package.json
```

### Key Design Patterns

1. **Separation of Concerns**: Prompt logic separate from API logic
2. **Environment Awareness**: Runtime detection of project context
3. **Graceful Fallbacks**: Default prompts when customization fails
4. **Type Safety**: Full TypeScript coverage for all interfaces

### Adding Custom Tools (Future)

Similar to qwen-code's tool registry, you can extend functionality:

```typescript
// Future: Tool integration
const tools = [
  'file-reader',
  'git-analyzer', 
  'dependency-checker',
  'code-formatter'
];
```

## 📚 Comparison with qwen-code

| Feature | qwen-code | Prism |
|---------|-----------|-------|
| **LLM Provider** | Qwen/OpenAI | Claude 4 |
| **Focus** | General CLI agent | Code review specialist |
| **Prompt Management** | File-based + env vars | Web UI + file-based |
| **Environment Detection** | Deep system integration | Project-focused |
| **Tool System** | Extensive built-in tools | Specialized for code review |
| **UI** | Terminal-based | Web-based chat interface |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [qwen-code](https://github.com/QwenLM/qwen-code) - Inspiration for the prompt management architecture
- [Anthropic Claude](https://www.anthropic.com/) - Powerful AI model for code analysis
- [Next.js](https://nextjs.org/) - React framework for the web interface

---

**Built with ❤️ by the Prism team** 

*Featuring 玄天仙子·琉璃, your adorable code review companion! φ(>ω<*) ✨*
