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
                parameters: Array<{ name: string; type: string }>;
                description: string;
            }>;
            constants?: Array<{
                name: string;
                type: string;
                value: any;
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
        const funcRegex = new RegExp(`def\\s+${word}\\s*\\(([^)]*)\\)(?:\\s*->\\s*([a-zA-Z][a-zA-Z0-9_]*))?\\s*:`, 'g');
        const funcMatch = funcRegex.exec(text);
        
        if (funcMatch) {
            const params = funcMatch[1] || '';
            const returnType = funcMatch[2] || 'Void';
            const lineNum = this.getLineNumber(text, funcMatch.index);
            
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

        // Check for variables with type annotations
        const varRegex = new RegExp(`(?:var|let|const|final)\\s+${word}\\s*(?::\\s*([a-zA-Z][a-zA-Z0-9_]*))?`, 'g');
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
}
