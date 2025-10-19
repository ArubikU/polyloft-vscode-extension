# Polyloft VSCode Extension - Quick Start Guide

Get started with Polyloft development in VSCode in minutes!

## Prerequisites

- Visual Studio Code 1.75.0 or higher
- Node.js and npm (for development/building the extension)
- Polyloft CLI installed (optional, but recommended)

## Installation

### Method 1: Install from VSIX (Recommended)

1. Download the latest `.vsix` file from the releases page
2. Open VSCode
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Extensions: Install from VSIX"
5. Select the downloaded `.vsix` file
6. Reload VSCode when prompted

### Method 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/ArubikU/polyloft.git
cd polyloft/vscode-extension

# Install dependencies
npm install

# Compile the extension
npm run compile

# Install the extension
code --install-extension .
```

## First Steps

### 1. Create a Polyloft File

Create a new file with the `.pf` extension:

```bash
touch hello.pf
```

### 2. Start Coding

Open the file in VSCode and start typing. The extension provides:

**Syntax Highlighting:**
```polyloft
// Comments are highlighted
let x: Int = 42        // Type annotations highlighted
println("Hello!")      // String literals highlighted
```

**Auto-completion:**
Type `pri` and press `Ctrl+Space` to see completions like `println`, `print`, `private`

**Hover Information:**
Hover over `println` to see its signature and documentation

### 3. Try Built-in Functions

```polyloft
// Math functions with auto-completion
let pi = Math.PI
let sqrt = Math.sqrt(16.0)
let power = Math.pow(2.0, 8.0)

// System functions
let time = Sys.time()
let rand = Sys.random()

println("Pi:", pi)
println("sqrt(16):", sqrt)
println("2^8:", power)
```

### 4. Create a Class

```polyloft
class Point
    var x: Float
    var y: Float
    
    Point(x: Float, y: Float):
        this.x = x
        this.y = y
    end
    
    def distance() -> Float:
        return Math.sqrt(this.x * this.x + this.y * this.y)
    end
end

let p = Point(3.0, 4.0)
println("Distance:", p.distance())  // Auto-complete shows 'distance' method
```

### 5. Use Go to Definition

- Press `F12` or `Ctrl+Click` on a class name or function name
- Jump to its definition instantly
- Works across files with imports

### 6. Import Libraries

```polyloft
import math.vector { Vec2, Vec3 }

let v1 = Vec2(1.0, 2.0)
let v2 = Vec2(3.0, 4.0)
let v3 = v1 + v2       // Vec2 methods auto-complete

println(v3.to_s())
```

## Common Features

### Auto-completion Triggers

- Type any keyword start: `cl` → suggests `class`
- Type `.` after an object: `Math.` → shows all Math functions
- Type `(` after function: automatically adds parameter placeholders
- Press `Ctrl+Space` anywhere for context-aware suggestions

### Linting

The extension automatically checks your code for:
- Syntax errors (unclosed strings, unmatched brackets)
- Missing `end` keywords
- Invalid constructs
- Naming conventions

Errors appear as red squiggles, warnings as yellow.

### Navigation

**Go to Definition:** `F12` or `Ctrl+Click`
**Go Back:** `Alt+Left Arrow`
**Peek Definition:** `Alt+F12`
**Find All References:** `Shift+F12`

### Hover Information

Hover over any symbol to see:
- Function signatures
- Type information
- Documentation
- Parameter types and return types

## Configuration

Customize the extension in VSCode settings (`Ctrl+,`):

```json
{
  "polyloft.linting.enabled": true,
  "polyloft.linting.onType": true,
  "polyloft.completion.enabled": true
}
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Auto-complete | `Ctrl+Space` |
| Go to Definition | `F12` or `Ctrl+Click` |
| Peek Definition | `Alt+F12` |
| Show Hover | `Ctrl+K Ctrl+I` |
| Format Document | `Shift+Alt+F` |
| Toggle Comment | `Ctrl+/` |

## Example Workflow

1. **Create a new project:**
   ```bash
   mkdir my-polyloft-project
   cd my-polyloft-project
   polyloft init
   ```

2. **Open in VSCode:**
   ```bash
   code .
   ```

3. **Create your main file:**
   ```bash
   touch src/main.pf
   ```

4. **Start coding with full IntelliSense!**

5. **Generate mappings for your libraries:**
   ```bash
   polyloft generate-mappings
   ```

6. **Run your code:**
   ```bash
   polyloft run src/main.pf
   ```

## Tips and Tricks

### Tip 1: Use String Interpolation
```polyloft
let name = "World"
println("Hello, #{name}!")  // Interpolation is highlighted
```

### Tip 2: Explore Built-in Libraries
Type `Math.` or `Sys.` and press `Ctrl+Space` to see all available functions.

### Tip 3: Quick Documentation
Hover over any built-in function to see its documentation instantly.

### Tip 4: Organize with Imports
Split your code into modules and use imports. The extension resolves them automatically.

### Tip 5: Generate Mappings
After creating library files, run `polyloft generate-mappings` to get auto-completion for your custom libraries.

## Getting Help

- **Documentation:** Check `docs/vscode-extension.md` in the repository
- **Examples:** See `vscode-extension/example.pf` for comprehensive examples
- **Issues:** Report bugs on GitHub Issues
- **Discussion:** Join the Polyloft community discussions

## Next Steps

- Explore the [full documentation](../docs/vscode-extension.md)
- Check out [example.pf](example.pf) for more features
- Read the [CHANGELOG](CHANGELOG.md) for latest updates
- Contribute to the extension on GitHub!

Happy coding with Polyloft! 🚀
