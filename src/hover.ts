import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface BuiltinPackages {
    globals: {
        functions: Array<{
            name: string;
            returnType: string;
            parameters: Array<{ name: string; type: string; variadic?: boolean; optional?: boolean }>;
            description: string;
        }>;
    };
    packages: {
        [key: string]: {
            type: string;
            description: string;
            functions?: Array<{
                name: string;
                returnType: string;
                parameters: Array<{ name: string; type: string; optional?: boolean }>;
                description: string;
            }>;
            constants?: Array<{
                name: string;
                type: string;
                value: any;
                description: string;
            }>;
            methods?: Array<{
                name: string;
                returnType: string;
                parameters: Array<{ name: string; type: string; optional?: boolean }>;
                description: string;
            }>;
        };
    };
}

export class PolyloftHoverProvider implements vscode.HoverProvider {
    private builtinPackages: BuiltinPackages | null = null;

    constructor(private context: vscode.ExtensionContext) {
        this.loadBuiltinPackages();
    }

    private loadBuiltinPackages(): void {
        try {
            const builtinPath = path.join(this.context.extensionPath, 'builtin-packages.json');
            const content = fs.readFileSync(builtinPath, 'utf8');
            this.builtinPackages = JSON.parse(content);
        } catch (error) {
            console.error('Failed to load builtin-packages.json:', error);
        }
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        const line = document.lineAt(position.line).text;

        // Check if hovering over an import statement
        const importHover = await this.getImportHover(document, position, line, word);
        if (importHover) {
            return importHover;
        }

        // Enhanced: Check for language keywords and provide helpful information
        const keywordInfo = this.getKeywordInfo(word);
        if (keywordInfo) {
            return new vscode.Hover(keywordInfo);
        }

        // Check if it's a builtin function
        if (this.builtinPackages) {
            for (const func of this.builtinPackages.globals.functions) {
                if (func.name === word) {
                    const params = func.parameters.map(p => {
                        const prefix = p.variadic ? '...' : '';
                        const suffix = p.optional ? '?' : '';
                        return `${prefix}${p.name}${suffix}: ${p.type}`;
                    }).join(', ');
                    
                    const markdown = new vscode.MarkdownString();
                    markdown.appendCodeblock(`${func.name}(${params}) -> ${func.returnType}`, 'polyloft');
                    markdown.appendMarkdown('\n\n' + func.description);
                    markdown.appendMarkdown('\n\n*Built-in function*');
                    
                    return new vscode.Hover(markdown);
                }
            }

            // Check if it's a builtin package method
            const memberMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (memberMatch && memberMatch[2] === word) {
                const packageName = memberMatch[1];
                const pkg = this.builtinPackages.packages[packageName];
                
                if (pkg) {
                    // Check functions
                    if (pkg.functions) {
                        for (const func of pkg.functions) {
                            if (func.name === word) {
                                const params = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
                                
                                const markdown = new vscode.MarkdownString();
                                markdown.appendCodeblock(`${packageName}.${func.name}(${params}) -> ${func.returnType}`, 'polyloft');
                                markdown.appendMarkdown('\n\n' + func.description);
                                markdown.appendMarkdown('\n\n*Built-in function*');
                                
                                return new vscode.Hover(markdown);
                            }
                        }
                    }

                    // Check constants
                    if (pkg.constants) {
                        for (const constant of pkg.constants) {
                            if (constant.name === word) {
                                const markdown = new vscode.MarkdownString();
                                markdown.appendCodeblock(`${packageName}.${constant.name}: ${constant.type} = ${constant.value}`, 'polyloft');
                                markdown.appendMarkdown('\n\n' + constant.description);
                                markdown.appendMarkdown('\n\n*Built-in constant*');
                                
                                return new vscode.Hover(markdown);
                            }
                        }
                    }

                    // Check methods (for builtin classes like String, Array, Map, Set)
                    if (pkg.methods) {
                        for (const method of pkg.methods) {
                            if (method.name === word) {
                                const params = method.parameters.map(p => {
                                    const optional = p.optional ? '?' : '';
                                    return `${p.name}${optional}: ${p.type}`;
                                }).join(', ');
                                
                                const markdown = new vscode.MarkdownString();
                                markdown.appendCodeblock(`${packageName}.${method.name}(${params}) -> ${method.returnType}`, 'polyloft');
                                markdown.appendMarkdown('\n\n' + method.description);
                                markdown.appendMarkdown('\n\n*Built-in method*');
                                
                                return new vscode.Hover(markdown);
                            }
                        }
                    }
                }
            }
        }

        const text = document.getText();
        const lines = text.split('\n');

        // Check if this word is an imported symbol
        const importedSymbolInfo = await this.checkImportedSymbol(document, word);
        if (importedSymbolInfo) {
            return importedSymbolInfo;
        }

        // Check for user-defined functions
        const funcRegex = new RegExp(`def\\s+${word}\\s*\\(([^)]*)\\)(?:\\s*->\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*))?\\s*:`, 'g');
        const funcMatch = funcRegex.exec(text);
        
        if (funcMatch) {
            const params = funcMatch[1] || '';
            let returnType = funcMatch[2];
            const lineNum = this.getLineNumber(text, funcMatch.index);
            
            // If no explicit return type, try to infer from return statements
            if (!returnType) {
                returnType = this.inferFunctionReturnType(lines, lineNum);
            }
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`def ${word}(${params}) -> ${returnType}`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            markdown.appendMarkdown(`\n\n*Defined at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        // Check for user-defined classes
        const classRegex = new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${word}(?:\\s+<\\s+([a-zA-Z][a-zA-Z0-9_]*))?(?:\\s+implements\\s+([^\\n{:]+))?`, 'g');
        const classMatch = classRegex.exec(text);
        
        if (classMatch) {
            const parent = classMatch[1] ? ` < ${classMatch[1]}` : '';
            const interfaces = classMatch[2] ? ` implements ${classMatch[2].trim()}` : '';
            const lineNum = this.getLineNumber(text, classMatch.index);
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`class ${word}${parent}${interfaces}`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            markdown.appendMarkdown(`\n\n*Defined at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        // Check for user-defined interfaces
        const interfaceRegex = new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${word}`, 'g');
        const interfaceMatch = interfaceRegex.exec(text);
        
        if (interfaceMatch) {
            const lineNum = this.getLineNumber(text, interfaceMatch.index);
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`interface ${word}`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            markdown.appendMarkdown(`\n\n*Defined at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        // Check for user-defined enums
        const enumRegex = new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${word}`, 'g');
        const enumMatch = enumRegex.exec(text);
        
        if (enumMatch) {
            const lineNum = this.getLineNumber(text, enumMatch.index);
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`enum ${word}`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            // Extract enum values
            const enumBodyMatch = text.match(new RegExp(`enum\\s+${word}\\s+[^]*?end`, 'g'));
            if (enumBodyMatch) {
                const enumBody = enumBodyMatch[0];
                const valueMatches = enumBody.matchAll(/^\s+([A-Z_][A-Z0-9_]*)\s*(?:\(|$)/gm);
                const values = Array.from(valueMatches).map(m => m[1]);
                if (values.length > 0) {
                    markdown.appendMarkdown(`\n\n**Values:** ${values.join(', ')}`);
                }
            }
            
            markdown.appendMarkdown(`\n\n*Defined at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        // Check for user-defined records
        const recordRegex = new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${word}(?:\\s*\\(([^)]*)\\))?`, 'g');
        const recordMatch = recordRegex.exec(text);
        
        if (recordMatch) {
            const params = recordMatch[1] || '';
            const lineNum = this.getLineNumber(text, recordMatch.index);
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`record ${word}(${params})`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            markdown.appendMarkdown(`\n\n*Defined at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        // Check for variables with type annotations (including generics)
        const varRegex = new RegExp(`(?:var|let|const|final)\\s+${word}\\s*(?::\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*))?`, 'g');
        const varMatch = varRegex.exec(text);
        
        if (varMatch) {
            const varType = varMatch[1] || 'Any';
            const lineNum = this.getLineNumber(text, varMatch.index);
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`${word}: ${varType}`, 'polyloft');
            
            // Extract preceding comments
            const comments = this.getPrecedingComments(lines, lineNum);
            if (comments) {
                markdown.appendMarkdown('\n\n' + comments);
            }
            
            markdown.appendMarkdown(`\n\n*Declared at line ${lineNum + 1}*`);
            
            return new vscode.Hover(markdown);
        }

        return undefined;
    }

    private getLineNumber(text: string, index: number): number {
        return text.substring(0, index).split('\n').length - 1;
    }

    private getPrecedingComments(lines: string[], lineNum: number): string | null {
        const comments: string[] = [];
        let i = lineNum - 1;
        
        // Collect comments immediately before the declaration
        while (i >= 0) {
            const line = lines[i].trim();
            
            if (line.startsWith('//')) {
                // Single-line comment
                comments.unshift(line.substring(2).trim());
                i--;
            } else if (line.endsWith('*/')) {
                // Multi-line comment (read backwards)
                const blockComments: string[] = [];
                while (i >= 0) {
                    const commentLine = lines[i].trim();
                    if (commentLine.startsWith('/*')) {
                        // Remove /* and */ markers and collect
                        let content = commentLine.substring(2);
                        if (content.endsWith('*/')) {
                            content = content.substring(0, content.length - 2);
                        }
                        blockComments.unshift(content.trim());
                        break;
                    } else {
                        // Remove leading * if present
                        let content = commentLine;
                        if (content.startsWith('*')) {
                            content = content.substring(1);
                        }
                        if (content.endsWith('*/')) {
                            content = content.substring(0, content.length - 2);
                        }
                        blockComments.unshift(content.trim());
                    }
                    i--;
                }
                comments.unshift(...blockComments);
                i--;
            } else if (line === '') {
                // Empty line, continue
                i--;
            } else {
                // Non-comment, non-empty line - stop
                break;
            }
        }
        
        return comments.length > 0 ? comments.join('\n') : null;
    }

    /**
     * Infer the return type of a function from its return statements
     */
    private inferFunctionReturnType(lines: string[], funcStartLine: number): string {
        // Find the function body (from funcStartLine to matching 'end')
        let blockLevel = 1;
        let returnTypes = new Set<string>();
        let hasReturn = false;
        
        for (let i = funcStartLine + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Track block nesting
            if (line.match(/^\s*(def|if|elif|else|for|loop|try|catch|finally|class|enum|record)\b.*:/)) {
                blockLevel++;
            }
            if (line.match(/^\s*end\b/)) {
                blockLevel--;
                if (blockLevel === 0) {
                    break;  // End of function
                }
            }
            
            // Look for return statements
            const returnMatch = line.match(/^\s*return\s+(.+)/);
            if (returnMatch) {
                hasReturn = true;
                const returnValue = returnMatch[1].trim();
                
                // Infer type from return value
                if (returnValue.match(/^["'].*["']$/)) {
                    returnTypes.add('String');
                } else if (returnValue.match(/^\d+$/)) {
                    returnTypes.add('Int');
                } else if (returnValue.match(/^\d+\.\d+$/)) {
                    returnTypes.add('Float');
                } else if (returnValue === 'true' || returnValue === 'false') {
                    returnTypes.add('Bool');
                } else if (returnValue === 'nil' || returnValue === 'null') {
                    returnTypes.add('Nil');
                } else if (returnValue.match(/^\[.*\]$/)) {
                    returnTypes.add('Array');
                } else if (returnValue.match(/^\{.*\}$/)) {
                    returnTypes.add('Map');
                } else {
                    // It's an expression or variable, mark as unknown
                    returnTypes.add('Any');
                }
            }
        }
        
        if (!hasReturn) {
            return 'Void';
        }
        
        // If all return types are the same, use that type
        if (returnTypes.size === 1) {
            return Array.from(returnTypes)[0];
        }
        
        // If multiple types, show them as union or use Any
        if (returnTypes.size > 1 && returnTypes.size <= 3) {
            return Array.from(returnTypes).join(' | ');
        }
        
        return 'Any';
    }

    /**
     * Check if a word is an imported symbol and provide hover info from the source file
     */
    private async checkImportedSymbol(
        document: vscode.TextDocument,
        word: string
    ): Promise<vscode.Hover | undefined> {
        const text = document.getText();
        
        // Find import statements that include this symbol
        const importRegex = /import\s+([a-zA-Z._\/]+)\s*\{\s*([^}]+)\s*\}/g;
        let importMatch;
        
        while ((importMatch = importRegex.exec(text)) !== null) {
            const importPath = importMatch[1];
            const symbols = importMatch[2].split(',').map(s => s.trim());
            
            if (symbols.includes(word)) {
                // Found the import, now resolve the file
                const resolvedFile = await this.resolveImportPath(document, importPath);
                if (resolvedFile) {
                    try {
                        const fileDocument = await vscode.workspace.openTextDocument(resolvedFile);
                        const fileText = fileDocument.getText();
                        const fileLines = fileText.split('\n');
                        
                        // Check for enum definition
                        const enumRegex = new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${word}\\b`, 'g');
                        const enumMatch = enumRegex.exec(fileText);
                        if (enumMatch) {
                            const lineNum = this.getLineNumber(fileText, enumMatch.index);
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`enum ${word}`, 'polyloft');
                            
                            const comments = this.getPrecedingComments(fileLines, lineNum);
                            if (comments) {
                                markdown.appendMarkdown('\n\n' + comments);
                            }
                            
                            // Extract enum values
                            const enumBodyMatch = fileText.match(new RegExp(`enum\\s+${word}\\s+[^]*?end`, 'g'));
                            if (enumBodyMatch) {
                                const enumBody = enumBodyMatch[0];
                                const valueMatches = enumBody.matchAll(/^\s+([A-Z_][A-Z0-9_]*)\s*(?:\(|$)/gm);
                                const values = Array.from(valueMatches).map(m => m[1]);
                                if (values.length > 0) {
                                    markdown.appendMarkdown(`\n\n**Values:** ${values.join(', ')}`);
                                }
                            }
                            
                            markdown.appendMarkdown(`\n\n*Imported from ${importPath}*`);
                            return new vscode.Hover(markdown);
                        }
                        
                        // Check for class definition
                        const classRegex = new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${word}(?:\\s+<\\s+([a-zA-Z][a-zA-Z0-9_]*))?(?:\\s+implements\\s+([^\\n{:]+))?`, 'g');
                        const classMatch = classRegex.exec(fileText);
                        if (classMatch) {
                            const parent = classMatch[1] ? ` < ${classMatch[1]}` : '';
                            const interfaces = classMatch[2] ? ` implements ${classMatch[2].trim()}` : '';
                            const lineNum = this.getLineNumber(fileText, classMatch.index);
                            
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`class ${word}${parent}${interfaces}`, 'polyloft');
                            
                            const comments = this.getPrecedingComments(fileLines, lineNum);
                            if (comments) {
                                markdown.appendMarkdown('\n\n' + comments);
                            }
                            
                            markdown.appendMarkdown(`\n\n*Imported from ${importPath}*`);
                            return new vscode.Hover(markdown);
                        }
                        
                        // Check for record definition
                        const recordRegex = new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${word}(?:\\s*\\(([^)]*)\\))?`, 'g');
                        const recordMatch = recordRegex.exec(fileText);
                        if (recordMatch) {
                            const params = recordMatch[1] || '';
                            const lineNum = this.getLineNumber(fileText, recordMatch.index);
                            
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`record ${word}(${params})`, 'polyloft');
                            
                            const comments = this.getPrecedingComments(fileLines, lineNum);
                            if (comments) {
                                markdown.appendMarkdown('\n\n' + comments);
                            }
                            
                            markdown.appendMarkdown(`\n\n*Imported from ${importPath}*`);
                            return new vscode.Hover(markdown);
                        }
                        
                        // Check for interface definition
                        const interfaceRegex = new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${word}`, 'g');
                        const interfaceMatch = interfaceRegex.exec(fileText);
                        if (interfaceMatch) {
                            const lineNum = this.getLineNumber(fileText, interfaceMatch.index);
                            
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`interface ${word}`, 'polyloft');
                            
                            const comments = this.getPrecedingComments(fileLines, lineNum);
                            if (comments) {
                                markdown.appendMarkdown('\n\n' + comments);
                            }
                            
                            markdown.appendMarkdown(`\n\n*Imported from ${importPath}*`);
                            return new vscode.Hover(markdown);
                        }
                        
                        // Check for function definition
                        const funcRegex = new RegExp(`def\\s+${word}\\s*\\(([^)]*)\\)(?:\\s*->\\s*([a-zA-Z][a-zA-Z0-9_]*))?\\s*:`, 'g');
                        const funcMatch = funcRegex.exec(fileText);
                        if (funcMatch) {
                            const params = funcMatch[1] || '';
                            const returnType = funcMatch[2] || 'Void';
                            const lineNum = this.getLineNumber(fileText, funcMatch.index);
                            
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`def ${word}(${params}) -> ${returnType}`, 'polyloft');
                            
                            const comments = this.getPrecedingComments(fileLines, lineNum);
                            if (comments) {
                                markdown.appendMarkdown('\n\n' + comments);
                            }
                            
                            markdown.appendMarkdown(`\n\n*Imported from ${importPath}*`);
                            return new vscode.Hover(markdown);
                        }
                    } catch (error) {
                        console.error('Error reading imported file:', error);
                    }
                }
                break;
            }
        }
        
        return undefined;
    }

    /**
     * Resolve an import path to a file system path
     */
    private async resolveImportPath(
        document: vscode.TextDocument,
        importPath: string
    ): Promise<vscode.Uri | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        const parts = importPath.split('.');
        const basePath = workspaceFolder.uri.fsPath;
        
        // Try multiple resolution strategies
        const possiblePaths = [
            // Try libs folder first
            path.join(basePath, 'libs', ...parts, 'index.pf'),
            path.join(basePath, 'libs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.pf`),
            // Try src folder for local imports
            path.join(basePath, 'src', `${importPath}.pf`),
            path.join(basePath, 'src', ...parts, 'index.pf'),
            // Try root level
            path.join(basePath, `${importPath}.pf`),
            path.join(basePath, ...parts, 'index.pf'),
        ];

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return vscode.Uri.file(filePath);
            }
        }

        return undefined;
    }

    /**
     * Enhanced: Provide keyword hover information with examples
     */
    private getKeywordInfo(word: string): vscode.MarkdownString | undefined {
        const keywords: { [key: string]: { description: string; example: string } } = {
            'let': {
                description: 'Declares a mutable variable that can be reassigned.',
                example: 'let x = 10\nx = 20  // Valid'
            },
            'const': {
                description: 'Declares a constant variable that cannot be reassigned.',
                example: 'const PI = 3.14159\n// PI = 3.14  // Error: Cannot reassign const'
            },
            'final': {
                description: 'Declares a final variable that cannot be reassigned (similar to const).',
                example: 'final MAX_SIZE = 100\n// MAX_SIZE = 200  // Error: Cannot reassign final'
            },
            'var': {
                description: 'Declares a mutable variable (legacy, prefer `let`).',
                example: 'var count = 0\ncount = count + 1'
            },
            'def': {
                description: 'Defines a function.',
                example: 'def greet(name: String) -> String:\n    return "Hello, #{name}!"\nend'
            },
            'class': {
                description: 'Defines a class.',
                example: 'class Person:\n    let name\n    let age\n    \n    def init(name, age):\n        this.name = name\n        this.age = age\n    end\nend'
            },
            'interface': {
                description: 'Defines an interface.',
                example: 'interface Drawable:\n    def draw()\nend'
            },
            'enum': {
                description: 'Defines an enumeration.',
                example: 'enum Color\n    RED\n    GREEN\n    BLUE\nend'
            },
            'record': {
                description: 'Defines an immutable record type with automatic constructor.',
                example: 'record Point(x: Int, y: Int)\n    def distance():\n        return Math.sqrt(this.x * this.x + this.y * this.y)\n    end\nend'
            },
            'if': {
                description: 'Conditional statement.',
                example: 'if x > 10:\n    println("Greater than 10")\nend'
            },
            'elif': {
                description: 'Else-if conditional branch.',
                example: 'if x > 10:\n    println("Greater")\nelif x < 10:\n    println("Less")\nelse:\n    println("Equal")\nend'
            },
            'else': {
                description: 'Else branch for conditional statements.',
                example: 'if condition:\n    // do something\nelse:\n    // do something else\nend'
            },
            'for': {
                description: 'Iteration loop. Use `where` clause for filtering.',
                example: 'for i in 0...10:\n    println(i)\nend\n\n// With where clause\nfor n in numbers where n > 5:\n    println(n)\nend'
            },
            'loop': {
                description: 'Infinite loop (use break to exit).',
                example: 'loop:\n    if condition:\n        break\n    end\nend'
            },
            'where': {
                description: 'Filter clause for for loops.',
                example: 'for item in collection where item.active:\n    process(item)\nend'
            },
            'break': {
                description: 'Exits the current loop.',
                example: 'for i in 0...100:\n    if i > 10:\n        break\n    end\nend'
            },
            'continue': {
                description: 'Skips to the next iteration of the loop.',
                example: 'for i in 0...10:\n    if i % 2 == 0:\n        continue\n    end\n    println(i)  // Only odd numbers\nend'
            },
            'return': {
                description: 'Returns a value from a function.',
                example: 'def add(a, b):\n    return a + b\nend'
            },
            'import': {
                description: 'Imports symbols from another module.',
                example: 'import math.vector { Vec2, Vec3 }\nimport utils { Logger }'
            },
            'this': {
                description: 'References the current instance in a class, enum, or record.',
                example: 'class MyClass:\n    let value\n    \n    def setValue(v):\n        this.value = v\n    end\nend'
            },
            'super': {
                description: 'References the parent class.',
                example: 'class Child < Parent:\n    def init():\n        super.init()\n    end\nend'
            },
            'try': {
                description: 'Begins a try-catch-finally block for error handling.',
                example: 'try:\n    riskyOperation()\ncatch e:\n    println("Error: #{e}")\nfinally:\n    cleanup()\nend'
            },
            'catch': {
                description: 'Catches exceptions in a try block.',
                example: 'try:\n    riskyOperation()\ncatch error:\n    handleError(error)\nend'
            },
            'finally': {
                description: 'Executes code after try-catch regardless of exceptions.',
                example: 'try:\n    openFile()\ncatch e:\n    handleError(e)\nfinally:\n    closeFile()  // Always executes\nend'
            },
            'throw': {
                description: 'Throws an exception.',
                example: 'if value < 0:\n    throw "Value must be positive"\nend'
            },
            'defer': {
                description: 'Defers execution until the current scope exits.',
                example: 'def processFile():\n    let file = openFile("data.txt")\n    defer file.close()  // Called when function exits\n    // process file\nend'
            },
            'switch': {
                description: 'Multi-way branch statement.',
                example: 'switch value:\n    case 1:\n        println("One")\n    case 2:\n        println("Two")\n    default:\n        println("Other")\nend'
            },
            'static': {
                description: 'Declares a static member that belongs to the class, not instances.',
                example: 'class Math:\n    static PI = 3.14159\n    \n    static def square(x):\n        return x * x\n    end\nend'
            },
            'abstract': {
                description: 'Declares an abstract class or method that must be implemented by subclasses.',
                example: 'abstract class Shape:\n    abstract def area()\nend'
            },
            'sealed': {
                description: 'Prevents a class from being inherited.',
                example: 'sealed class FinalClass:\n    // Cannot be extended\nend'
            },
            'instanceof': {
                description: 'Checks if an object is an instance of a class.',
                example: 'if obj instanceof MyClass:\n    println("Is instance")\nend'
            },
            'true': {
                description: 'Boolean true value.',
                example: 'let isActive = true'
            },
            'false': {
                description: 'Boolean false value.',
                example: 'let isActive = false'
            },
            'nil': {
                description: 'Null value (absence of value).',
                example: 'let value = nil'
            },
            'null': {
                description: 'Null value (absence of value).',
                example: 'let value = null'
            },
            'end': {
                description: 'Closes a block (class, function, if, loop, etc.).',
                example: 'if condition:\n    // code\nend'
            },
            'in': {
                description: 'Used in for loops to iterate over collections.',
                example: 'for item in collection:\n    println(item)\nend'
            },
            'public': {
                description: 'Makes a member accessible from anywhere.',
                example: 'class MyClass:\n    public let value\nend'
            },
            'pub': {
                description: 'Short form of public.',
                example: 'pub def myFunction():\nend'
            },
            'private': {
                description: 'Makes a member accessible only within the class.',
                example: 'class MyClass:\n    private let secret\nend'
            },
            'priv': {
                description: 'Short form of private.',
                example: 'priv def internalMethod():\nend'
            },
            'protected': {
                description: 'Makes a member accessible within the class and subclasses.',
                example: 'class MyClass:\n    protected let value\nend'
            },
            'prot': {
                description: 'Short form of protected.',
                example: 'prot def helperMethod():\nend'
            },
            'implements': {
                description: 'Declares that a class implements an interface.',
                example: 'class MyClass implements Drawable:\n    @Override\n    def draw():\n        println("Drawing")\n    end\nend'
            },
            '@Override': {
                description: 'Annotation marking methods that override parent class methods or implement interface methods.',
                example: 'class Dog < Animal:\n    @Override\n    def speak():\n        println("Woof!")\n    end\nend'
            },
            '@Deprecated': {
                description: 'Annotation marking deprecated methods or classes.',
                example: '@Deprecated\ndef oldMethod():\n    println("Use newMethod instead")\nend'
            }
        };

        const info = keywords[word];
        if (info) {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`**\`${word}\`** keyword\n\n`);
            markdown.appendMarkdown(info.description + '\n\n');
            markdown.appendMarkdown('**Example:**\n');
            markdown.appendCodeblock(info.example, 'polyloft');
            markdown.isTrusted = true;
            return markdown;
        }

        return undefined;
    }

    private async getImportHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        line: string,
        word: string
    ): Promise<vscode.Hover | undefined> {
        // Check if the line is an import statement - use same pattern as syntax file
        const importMatch = line.match(/^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.\/]*)(?:\s*\{([^}]*)\})?/);
        if (!importMatch) {
            return undefined;
        }

        const importPath = importMatch[1];
        const importedSymbols = importMatch[2] ? importMatch[2].split(',').map(s => s.trim()) : [];

        // Check if we're hovering over the import keyword
        if (word === 'import') {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`**\`import\`** statement\n\n`);
            markdown.appendMarkdown(`Imports symbols from module: \`${importPath}\`\n\n`);
            if (importedSymbols.length > 0) {
                markdown.appendMarkdown(`**Imported symbols:** ${importedSymbols.join(', ')}\n\n`);
            }
            return new vscode.Hover(markdown);
        }

        // Check if we're hovering over the import path or a symbol
        if (line.indexOf(word) !== -1) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                return undefined;
            }

            const basePath = workspaceFolder.uri.fsPath;
            const parts = importPath.split('.');
            
            // Try to resolve the import path
            const possiblePaths = [
                path.join(basePath, 'libs', ...parts, 'index.pf'),
                path.join(basePath, 'libs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.pf`),
                path.join(basePath, 'src', ...parts, 'index.pf'),
                path.join(basePath, 'src', ...parts.slice(0, -1), `${parts[parts.length - 1]}.pf`),
                path.join(basePath, ...parts, 'index.pf'),
                path.join(basePath, ...parts.slice(0, -1), `${parts[parts.length - 1]}.pf`),
            ];

            let resolvedPath: string | undefined;
            let sourceLocation = 'unknown location';

            // Use async file system operations
            for (const filePath of possiblePaths) {
                try {
                    const fileUri = vscode.Uri.file(filePath);
                    await vscode.workspace.fs.stat(fileUri);
                    resolvedPath = filePath;
                    
                    // Determine if it's from libs, src, or other
                    if (filePath.includes(`${path.sep}libs${path.sep}`)) {
                        sourceLocation = 'lib (standard library)';
                    } else if (filePath.includes(`${path.sep}src${path.sep}`)) {
                        sourceLocation = 'src (project source)';
                    } else {
                        sourceLocation = 'project root';
                    }
                    break;
                } catch {
                    // File doesn't exist, continue to next path
                    continue;
                }
            }

            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`**Import:** \`${importPath}\`\n\n`);
            
            if (resolvedPath) {
                const relativePath = path.relative(basePath, resolvedPath);
                markdown.appendMarkdown(`**Location:** ${sourceLocation}\n\n`);
                markdown.appendMarkdown(`**File:** \`${relativePath}\`\n\n`);
                
                // Make it clickable
                const fileUri = vscode.Uri.file(resolvedPath);
                markdown.appendMarkdown(`[Open file](${fileUri.toString()})\n\n`);
                markdown.isTrusted = true;
            } else {
                markdown.appendMarkdown(`**Status:** ⚠️ File not found\n\n`);
                markdown.appendMarkdown(`Searched in: libs/, src/, and project root\n\n`);
            }

            if (importedSymbols.length > 0 && importedSymbols.includes(word)) {
                markdown.appendMarkdown(`**Imported symbol:** \`${word}\`\n\n`);
            }

            return new vscode.Hover(markdown);
        }

        return undefined;
    }
}
