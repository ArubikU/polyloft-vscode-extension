# Changelog

All notable changes to the Polyloft VSCode Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2024-10-19

### Added

#### Language Support
- Complete TextMate grammar for syntax highlighting
- Language configuration with auto-closing pairs, bracket matching, and indentation
- Support for all Polyloft keywords and language constructs
- String interpolation highlighting (`#{expression}`)
- Comment support (line `//` and block `/* */`)

#### Linting
- Real-time syntax validation and error reporting
- Detection of common syntax errors:
  - Unclosed string literals
  - Unmatched brackets
  - Missing `end` keywords for blocks
  - Invalid function declarations
  - Use of `this` outside class context
  - Return statements outside functions
- Convention warnings (e.g., class names should start with uppercase)
- Configurable linting options (`polyloft.linting.enabled`, `polyloft.linting.onType`)

#### Auto-completion
- Keyword completion for all Polyloft keywords
- Type completion (String, Int, Float, Double, Bool, Void, Array, Map, Any)
- Built-in function completion:
  - Global functions: `println`, `print`
  - `Sys` package: `time`, `random`, `sleep`
  - `Math` package: functions and constants
- User-defined symbol completion:
  - Class names
  - Function names
  - Variable names
  - Method names (smart member completion after dot)
- Import symbol completion
- Function parameter snippets

#### Navigation
- Go to Definition support:
  - Jump to class definitions
  - Jump to function/method definitions
  - Jump to variable declarations
  - Cross-file navigation for imports
- Hover information:
  - Function signatures with parameters and return types
  - Type information for variables
  - Documentation for built-in functions
  - Class inheritance information

#### Multi-file Support
- Import statement parsing and resolution
- Cross-file symbol resolution
- Standard library path resolution (`libs/`)
- Support for multiple import resolution strategies

#### Built-in Library Definitions
- Comprehensive `builtin-packages.json` with:
  - Global functions documentation
  - Sys package functions and descriptions
  - Math package functions, constants, and descriptions
  - Standard library packages (math.vector, utils)

#### Mappings Generator (CLI)
- New `polyloft generate-mappings` command
- Automatic extraction of symbols from `.pf` files:
  - Class definitions with methods and fields
  - Function definitions with parameters and return types
  - Import/export information
  - Type information
  - File locations and line numbers
- JSON output format for IDE consumption
- Configurable output path and root directory

#### Documentation
- Comprehensive README for the extension
- Installation guide with development and production steps
- Detailed feature documentation
- Usage examples
- Configuration guide
- Development and contributing guide

### Configuration Options

Added the following configuration options:
- `polyloft.linting.enabled` - Enable/disable linting (default: true)
- `polyloft.linting.onType` - Enable linting while typing (default: true)
- `polyloft.completion.enabled` - Enable/disable auto-completion (default: true)
- `polyloft.trace.server` - Trace communication for debugging (default: "off")

### Developer Tools

#### Extension Architecture
- TypeScript-based extension with proper type definitions
- Modular provider architecture:
  - `linter.ts` - Syntax validation
  - `completion.ts` - Auto-completion
  - `definition.ts` - Go to Definition
  - `hover.ts` - Hover information
  - `extension.ts` - Main entry point
- Comprehensive error handling
- Efficient document parsing

#### Build System
- TypeScript compilation with source maps
- NPM scripts for development workflow
- Watch mode for iterative development
- Package script for distribution

### Files Added
- `vscode-extension/package.json` - Extension manifest
- `vscode-extension/tsconfig.json` - TypeScript configuration
- `vscode-extension/syntaxes/polyloft.tmLanguage.json` - TextMate grammar
- `vscode-extension/language-configuration/language-configuration.json` - Language config
- `vscode-extension/builtin-packages.json` - Built-in library definitions
- `vscode-extension/src/extension.ts` - Main extension
- `vscode-extension/src/linter.ts` - Linting provider
- `vscode-extension/src/completion.ts` - Completion provider
- `vscode-extension/src/definition.ts` - Definition provider
- `vscode-extension/src/hover.ts` - Hover provider
- `vscode-extension/README.md` - Extension documentation
- `vscode-extension/INSTALL.md` - Installation guide
- `vscode-extension/CHANGELOG.md` - This file
- `vscode-extension/example.pf` - Example file demonstrating features
- `internal/mappings/generator.go` - Mappings generator
- `docs/vscode-extension.md` - Comprehensive documentation

### Known Limitations
- No Language Server Protocol (LSP) implementation yet
- No debugging support
- No code formatting provider
- No refactoring support (rename, extract, etc.)
- No test runner integration

### Future Roadmap
- Implement Language Server Protocol (LSP)
- Add semantic highlighting
- Code actions and quick fixes
- Refactoring support
- Debugging integration
- Test runner integration
- Snippets library
- Formatting provider
- Package registry integration in IDE

## [Unreleased]

### Added

#### Enhanced Auto-completion for Enums and Records (v0.1.2)

**Enum Completions:**
- Auto-complete enum type names (e.g., `Color`, `Status`)
- Enum value suggestions when typing `EnumName.` (e.g., `Color.RED`, `Color.GREEN`, `Color.BLUE`)
- Enum static method completions:
  - `valueOf(name: String)` - Get enum value by name
  - `values()` - Get all enum values
  - `size()` - Get number of enum values
  - `names()` - Get array of enum value names
- Custom static methods defined in enum body
- Enum instance member completions:
  - Built-in fields: `name`, `ordinal`
  - Built-in method: `toString()`
  - Custom instance methods and fields
- Support for sealed enums with visibility modifiers (public, private, protected)

**Record Completions:**
- Auto-complete record type names
- Record component field completions (e.g., `point.x`, `point.y`)
- Record instance method completions
- Built-in `toString()` method suggestion
- Support for records with visibility modifiers

**Class Enhancements:**
- Improved method completion for classes
- Built-in `toString()` method suggestion for classes
- Better field detection including `let` and `var` declarations

**Parser Improvements:**
- Enhanced regex patterns to detect enums with modifiers (sealed, public, private, protected)
- Better parsing of enum constructors and methods
- Improved record component parsing with type annotations
- Support for multi-line enum and record declarations

#### Enhanced Linting (v0.1.1)

**Critical Error Detection:**
- Detection of `const` variable reassignment attempts
- Detection of `final` variable reassignment attempts
- Detection of `break` statements outside of loops
- Detection of `continue` statements outside of loops
- Detection of duplicate variable declarations in the same scope

**Code Quality Warnings:**
- Detection of unreachable code after `return` statements
- Warning for function parameters without type annotations
- Information hint for functions without return type declarations
- Hint for unused imported symbols
- Hint for inconsistent indentation (should be multiples of 4 spaces)

**Improvements:**
- More precise error messages with line references for const/final violations
- Better scope analysis for variable declarations
- Enhanced control flow analysis for loops

## [0.1.0] - 2024-10-19
