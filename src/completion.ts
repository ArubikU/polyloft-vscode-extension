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

export class PolyloftCompletionProvider implements vscode.CompletionItemProvider {
    private keywords = [
        'var', 'let', 'const', 'final', 'def', 'class', 'interface', 'import',
        'implements', 'abstract', 'sealed', 'return', 'if', 'elif', 'else',
        'for', 'in', 'loop', 'break', 'continue', 'end', 'do', 'true', 'false',
        'nil', 'thread', 'spawn', 'join', 'public', 'pub', 'private', 'priv',
        'protected', 'prot', 'static', 'this', 'super', 'instanceof', 'enum',
        'record', 'try', 'catch', 'finally', 'throw'
    ];

    private types = ['String', 'Int', 'Float', 'Double', 'Bool', 'Void', 'Array', 'Map', 'Any'];

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

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const config = vscode.workspace.getConfiguration('polyloft');
        if (!config.get('completion.enabled')) {
            return [];
        }

        const completionItems: vscode.CompletionItem[] = [];
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        // Check if we're after a dot (member access) - handles both "Object." and "Object.part"
        const dotMatch = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)?$/);
        if (dotMatch) {
            return await this.provideMemberCompletions(document, position, linePrefix);
        }

        // Keyword completions
        this.keywords.forEach(keyword => {
            const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
            item.detail = 'Polyloft keyword';
            
            // Add snippets for thread keywords
            if (keyword === 'thread') {
                item.insertText = new vscode.SnippetString('thread ${1|spawn,join|}');
                item.documentation = new vscode.MarkdownString('Thread operations: `spawn` creates a new thread, `join` waits for a thread to complete');
            }
            
            completionItems.push(item);
        });
        
        // Add specific thread spawn completion
        const threadSpawnItem = new vscode.CompletionItem('thread spawn', vscode.CompletionItemKind.Snippet);
        threadSpawnItem.insertText = new vscode.SnippetString('thread spawn do\n\t${1:// thread code}\n\treturn ${2:result}\nend');
        threadSpawnItem.detail = 'Create a new thread';
        threadSpawnItem.documentation = new vscode.MarkdownString('Creates a new thread that executes the block. Use `return` to return a value from the thread.');
        completionItems.push(threadSpawnItem);
        
        // Add thread join completion
        const threadJoinItem = new vscode.CompletionItem('thread join', vscode.CompletionItemKind.Snippet);
        threadJoinItem.insertText = new vscode.SnippetString('thread join ${1:threadVariable}');
        threadJoinItem.detail = 'Wait for a thread to complete';
        threadJoinItem.documentation = new vscode.MarkdownString('Waits for the specified thread to complete and returns its result.');
        completionItems.push(threadJoinItem);

        // Type completions
        this.types.forEach(type => {
            const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Class);
            item.detail = 'Polyloft type';
            completionItems.push(item);
        });

        // Global function completions
        if (this.builtinPackages) {
            this.builtinPackages.globals.functions.forEach(func => {
                const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
                item.detail = `${func.name}(${func.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}) -> ${func.returnType}`;
                item.documentation = new vscode.MarkdownString(func.description);
                
                // Create snippet for function parameters
                const params = func.parameters.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
                item.insertText = new vscode.SnippetString(`${func.name}(${params})`);
                
                completionItems.push(item);
            });

            // Built-in package completions (Sys, Math, etc.)
            Object.keys(this.builtinPackages.packages).forEach(packageName => {
                const item = new vscode.CompletionItem(packageName, vscode.CompletionItemKind.Module);
                item.detail = this.builtinPackages!.packages[packageName].description;
                completionItems.push(item);
            });
        }

        // Parse document for class and function definitions
        const text = document.getText();
        const classMatches = text.matchAll(/class\s+([A-Z][a-zA-Z0-9_]*)/g);
        for (const match of classMatches) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Class);
            item.detail = 'User-defined class';
            completionItems.push(item);
        }

        // Parse document for enum definitions
        const enumMatches = text.matchAll(/(?:(?:public|private|protected|sealed)\s+)*enum\s+([A-Z][a-zA-Z0-9_]*)/g);
        for (const match of enumMatches) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Enum);
            item.detail = 'User-defined enum';
            completionItems.push(item);
        }

        // Parse document for record definitions
        const recordMatches = text.matchAll(/(?:(?:public|private|protected)\s+)*record\s+([A-Z][a-zA-Z0-9_]*)/g);
        for (const match of recordMatches) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Struct);
            item.detail = 'User-defined record';
            completionItems.push(item);
        }

        const funcMatches = text.matchAll(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
        for (const match of funcMatches) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Function);
            item.detail = 'User-defined function';
            completionItems.push(item);
        }

        // Parse document for variable declarations
        const varMatches = text.matchAll(/(?:var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
        for (const match of varMatches) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Variable);
            item.detail = 'Variable';
            completionItems.push(item);
        }

        // Parse imports to provide imported symbols
        const importMatches = text.matchAll(/import\s+([a-zA-Z._\/]+)\s*\{([^}]+)\}/g);
        for (const match of importMatches) {
            const importPath = match[1];
            const symbols = match[2].split(',').map(s => s.trim());
            symbols.forEach(symbol => {
                // Determine the symbol type by checking the imported file
                const symbolType = this.determineImportedSymbolType(text, symbol);
                const item = new vscode.CompletionItem(symbol, symbolType);
                item.detail = `Imported from ${match[1]}`;
                completionItems.push(item);
            });
        }

        return completionItems;
    }

    /**
     * Determine the type of an imported symbol by looking at how it's used or defined
     */
    private determineImportedSymbolType(text: string, symbol: string): vscode.CompletionItemKind {
        // Check if it's used as a constructor (capitalized and followed by parentheses)
        if (symbol.match(/^[A-Z]/)) {
            // Could be Class, Enum, Record, or Interface
            // Check for enum-like usage (Symbol.VALUE)
            if (text.match(new RegExp(`${symbol}\\.[A-Z_][A-Z0-9_]*\\b`))) {
                return vscode.CompletionItemKind.Enum;
            }
            // Default to class for capitalized symbols
            return vscode.CompletionItemKind.Class;
        }
        // Lowercase symbols are likely functions
        return vscode.CompletionItemKind.Function;
    }

    private async provideMemberCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        linePrefix: string
    ): Promise<vscode.CompletionItem[]> {
        const completionItems: vscode.CompletionItem[] = [];

        // Extract the object/module before the dot (handles both "Object." and "Object.part")
        const match = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)?$/);
        if (!match) {
            return completionItems;
        }

        const objectName = match[1];

        // Check if it's a builtin package (Sys, Math, etc.)
        if (this.builtinPackages && this.builtinPackages.packages[objectName]) {
            const pkg = this.builtinPackages.packages[objectName];

            // Add functions
            if (pkg.functions) {
                pkg.functions.forEach(func => {
                    const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Method);
                    item.detail = `${func.name}(${func.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}) -> ${func.returnType}`;
                    item.documentation = new vscode.MarkdownString(func.description);
                    
                    const params = func.parameters.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
                    item.insertText = new vscode.SnippetString(`${func.name}(${params})`);
                    
                    completionItems.push(item);
                });
            }

            // Add constants
            if (pkg.constants) {
                pkg.constants.forEach(constant => {
                    const item = new vscode.CompletionItem(constant.name, vscode.CompletionItemKind.Constant);
                    item.detail = `${constant.type} = ${constant.value}`;
                    item.documentation = new vscode.MarkdownString(constant.description);
                    completionItems.push(item);
                });
            }
        }

        const text = document.getText();

        // Check if it's an enum (including imported enums)
        const enumCompletions = await this.getEnumCompletions(document, text, objectName);
        if (enumCompletions.length > 0) {
            completionItems.push(...enumCompletions);
            return completionItems;
        }

        // Check if it's an enum value (e.g., Color.RED. should show instance methods)
        const enumInstanceCompletions = this.getEnumInstanceCompletions(text, linePrefix);
        if (enumInstanceCompletions.length > 0) {
            completionItems.push(...enumInstanceCompletions);
            return completionItems;
        }

        // Check if it's a record instance
        const recordInstanceCompletions = this.getRecordInstanceCompletions(text, objectName);
        if (recordInstanceCompletions.length > 0) {
            completionItems.push(...recordInstanceCompletions);
        }

        // Look for class definitions to suggest methods
        const classRegex = new RegExp(`class\\s+${objectName}\\s+[^]*?end`, 'g');
        const classMatch = classRegex.exec(text);
        
        if (classMatch) {
            const classBody = classMatch[0];
            const methodMatches = classBody.matchAll(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
            
            for (const methodMatch of methodMatches) {
                const item = new vscode.CompletionItem(methodMatch[1], vscode.CompletionItemKind.Method);
                item.detail = 'Method';
                completionItems.push(item);
            }

            // Add class fields
            const fieldMatches = classBody.matchAll(/(?:var|let|public\s+(?:var|let)|private\s+(?:var|let))\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
            for (const fieldMatch of fieldMatches) {
                const item = new vscode.CompletionItem(fieldMatch[1], vscode.CompletionItemKind.Field);
                item.detail = 'Field';
                completionItems.push(item);
            }

            // Add common class methods if not already present
            if (!Array.from(classBody.matchAll(/def\s+toString\s*\(/g)).length) {
                const item = new vscode.CompletionItem('toString', vscode.CompletionItemKind.Method);
                item.detail = 'toString() -> String';
                item.documentation = new vscode.MarkdownString('Returns a string representation of the object');
                completionItems.push(item);
            }
        }

        // Common string methods
        if (objectName === 'String' || this.isStringVariable(document, objectName)) {
            ['length', 'toUpperCase', 'toLowerCase', 'substring', 'split', 'trim'].forEach(method => {
                const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
                item.detail = 'String method';
                completionItems.push(item);
            });
        }

        return completionItems;
    }

    private isStringVariable(document: vscode.TextDocument, varName: string): boolean {
        const text = document.getText();
        const match = text.match(new RegExp(`(?:var|let|const)\\s+${varName}\\s*:\\s*String`));
        return match !== null;
    }

    /**
     * Get completions for enum static members (values and methods)
     */
    private async getEnumCompletions(document: vscode.TextDocument, text: string, enumName: string): Promise<vscode.CompletionItem[]> {
        const completionItems: vscode.CompletionItem[] = [];

        // First, check if this enum is imported
        const importRegex = /import\s+([a-zA-Z._\/]+)\s*\{([^}]+)\}/g;
        let importMatch;
        
        while ((importMatch = importRegex.exec(text)) !== null) {
            const importPath = importMatch[1];
            const symbols = importMatch[2].split(',').map(s => s.trim());
            
            if (symbols.includes(enumName)) {
                // Found the import, now resolve the file
                const resolvedFile = await this.resolveImportPath(document, importPath);
                if (resolvedFile) {
                    try {
                        const fileDocument = await vscode.workspace.openTextDocument(resolvedFile);
                        const fileText = fileDocument.getText();
                        
                        // Get enum completions from the imported file
                        const importedEnumCompletions = this.extractEnumCompletions(fileText, enumName);
                        if (importedEnumCompletions.length > 0) {
                            return importedEnumCompletions;
                        }
                    } catch (error) {
                        console.error('Error reading imported file:', error);
                    }
                }
                break;
            }
        }

        // If not imported, check in current document
        return this.extractEnumCompletions(text, enumName);
    }

    /**
     * Extract enum completions from text
     */
    private extractEnumCompletions(text: string, enumName: string): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];

        // Match enum declarations with optional modifiers
        const enumRegex = new RegExp(
            `(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${enumName}\\s+[^]*?end`,
            'g'
        );
        const enumMatch = enumRegex.exec(text);

        if (!enumMatch) {
            return completionItems;
        }

        const enumBody = enumMatch[0];

        // Extract enum values (lines that are just identifiers or identifiers with arguments)
        const valueMatches = enumBody.matchAll(/^\s+([A-Z_][A-Z0-9_]*)\s*(?:\(|$)/gm);
        for (const valueMatch of valueMatches) {
            const valueName = valueMatch[1];
            const item = new vscode.CompletionItem(valueName, vscode.CompletionItemKind.EnumMember);
            item.detail = `${enumName}.${valueName}`;
            item.documentation = new vscode.MarkdownString(`Enum value of ${enumName}`);
            completionItems.push(item);
        }

        // Add static enum methods
        const staticMethods = [
            {
                name: 'valueOf',
                detail: 'valueOf(name: String) -> EnumValue',
                doc: 'Returns the enum value with the specified name'
            },
            {
                name: 'values',
                detail: 'values() -> Array[EnumValue]',
                doc: 'Returns an array of all enum values'
            },
            {
                name: 'size',
                detail: 'size() -> Int',
                doc: 'Returns the number of enum values'
            },
            {
                name: 'names',
                detail: 'names() -> Array[String]',
                doc: 'Returns an array of all enum value names'
            }
        ];

        staticMethods.forEach(method => {
            const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
            item.detail = method.detail;
            item.documentation = new vscode.MarkdownString(method.doc);
            if (method.name === 'valueOf') {
                item.insertText = new vscode.SnippetString(`${method.name}(\${1:name})`);
            } else {
                item.insertText = new vscode.SnippetString(`${method.name}()`);
            }
            completionItems.push(item);
        });

        // Extract custom static methods from enum body (including private/public modifiers)
        const staticMethodMatches = enumBody.matchAll(/(?:(?:public|pub|private|priv|protected|prot|static)\s+)?def\s+(?:::)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
        for (const methodMatch of staticMethodMatches) {
            const methodName = methodMatch[1];
            // Skip if it's already in our static methods list or if it's a constructor
            if (!staticMethods.some(m => m.name === methodName) && methodName !== enumName) {
                const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
                item.detail = 'Custom static method';
                completionItems.push(item);
            }
        }

        return completionItems;
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
     * Get completions for enum instance members (fields and methods on enum values)
     */
    private getEnumInstanceCompletions(text: string, linePrefix: string): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];

        // Check if we're accessing an enum value (e.g., Color.RED. or Color.RED.n)
        const enumValueMatch = linePrefix.match(/([A-Z][a-zA-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)?$/);
        if (!enumValueMatch) {
            return completionItems;
        }

        const enumName = enumValueMatch[1];
        const valueName = enumValueMatch[2];

        // Verify this is actually an enum
        const enumRegex = new RegExp(
            `(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${enumName}\\s+[^]*?end`,
            'g'
        );
        const enumMatch = enumRegex.exec(text);

        if (!enumMatch) {
            return completionItems;
        }

        const enumBody = enumMatch[0];

        // Add built-in enum instance fields
        const builtinFields = [
            { name: 'name', detail: 'String', doc: 'The name of this enum value' },
            { name: 'ordinal', detail: 'Int', doc: 'The ordinal position of this enum value' }
        ];

        builtinFields.forEach(field => {
            const item = new vscode.CompletionItem(field.name, vscode.CompletionItemKind.Field);
            item.detail = field.detail;
            item.documentation = new vscode.MarkdownString(field.doc);
            completionItems.push(item);
        });

        // Add custom instance fields from enum
        const fieldMatches = enumBody.matchAll(/^\s+var\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm);
        for (const fieldMatch of fieldMatches) {
            const item = new vscode.CompletionItem(fieldMatch[1], vscode.CompletionItemKind.Field);
            item.detail = 'Instance field';
            completionItems.push(item);
        }

        // Add instance methods (including private methods)
        const methodMatches = enumBody.matchAll(/(?:(?:public|pub|private|priv|protected|prot)\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
        for (const methodMatch of methodMatches) {
            const methodName = methodMatch[1];
            // Skip constructor (has same name as enum)
            if (methodName !== enumName) {
                const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
                item.detail = 'Instance method';
                completionItems.push(item);
            }
        }

        // Add toString if not already present
        if (!Array.from(enumBody.matchAll(/def\s+toString\s*\(/g)).length) {
            const item = new vscode.CompletionItem('toString', vscode.CompletionItemKind.Method);
            item.detail = 'toString() -> String';
            item.documentation = new vscode.MarkdownString('Returns a string representation of the enum value');
            item.insertText = new vscode.SnippetString('toString()');
            completionItems.push(item);
        }

        return completionItems;
    }

    /**
     * Get completions for record instance members
     */
    private getRecordInstanceCompletions(text: string, recordName: string): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];

        // Match record declarations
        const recordRegex = new RegExp(
            `(?:(?:public|private|protected)\\s+)*record\\s+${recordName}\\s*\\(([^)]*)\\)\\s*[^]*?end`,
            'g'
        );
        const recordMatch = recordRegex.exec(text);

        if (!recordMatch) {
            return completionItems;
        }

        const recordBody = recordMatch[0];
        const componentsStr = recordMatch[1];

        // Parse record components
        if (componentsStr) {
            const components = componentsStr.split(',').map(c => c.trim());
            components.forEach(component => {
                const componentMatch = component.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*([a-zA-Z_][a-zA-Z0-9_]*))?/);
                if (componentMatch) {
                    const componentName = componentMatch[1];
                    const componentType = componentMatch[2] || 'Any';
                    const item = new vscode.CompletionItem(componentName, vscode.CompletionItemKind.Field);
                    item.detail = componentType;
                    item.documentation = new vscode.MarkdownString(`Record component of type ${componentType}`);
                    completionItems.push(item);
                }
            });
        }

        // Add custom methods from record body
        const methodMatches = recordBody.matchAll(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
        for (const methodMatch of methodMatches) {
            const item = new vscode.CompletionItem(methodMatch[1], vscode.CompletionItemKind.Method);
            item.detail = 'Record method';
            completionItems.push(item);
        }

        // Add toString if not already present
        if (!Array.from(recordBody.matchAll(/def\s+toString\s*\(/g)).length) {
            const item = new vscode.CompletionItem('toString', vscode.CompletionItemKind.Method);
            item.detail = 'toString() -> String';
            item.documentation = new vscode.MarkdownString('Returns a string representation of the record');
            item.insertText = new vscode.SnippetString('toString()');
            completionItems.push(item);
        }

        return completionItems;
    }
}
