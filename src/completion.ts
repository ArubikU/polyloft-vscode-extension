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

export class PolyloftCompletionProvider implements vscode.CompletionItemProvider {
    private keywords = [
        'var', 'let', 'const', 'final', 'def', 'class', 'interface', 'import',
        'implements', 'abstract', 'sealed', 'return', 'if', 'elif', 'else',
        'for', 'in', 'loop', 'break', 'continue', 'end', 'do', 'true', 'false',
        'nil', 'null', 'thread', 'spawn', 'join', 'public', 'pub', 'private', 'priv',
        'protected', 'prot', 'static', 'this', 'super', 'instanceof', 'enum',
        'record', 'try', 'catch', 'finally', 'throw', 'defer', 'switch', 'case',
        'default', 'where', 'from', 'as', 'export', 'extends', 'out'
    ];

    private types = [
        'String', 'Int', 'Float', 'Double', 'Bool', 'Void', 'Any',
        'Array', 'Map', 'List', 'Set', 'Deque', 'Tuple', 'Pair',
        'Range', 'Bytes', 'Promise', 'CompletableFuture',
        'HttpServer', 'HttpRequest', 'HttpResponse'
    ];

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

        // Enhanced: Add useful code snippets
        const snippets = this.provideEnhancedSnippets();
        completionItems.push(...snippets);

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

            // Add methods (for builtin classes like String, Array, Map, Set)
            if (pkg.methods) {
                pkg.methods.forEach(method => {
                    const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
                    const params = method.parameters.map(p => {
                        const optional = p.optional ? '?' : '';
                        return `${p.name}${optional}: ${p.type}`;
                    }).join(', ');
                    item.detail = `${method.name}(${params}) -> ${method.returnType}`;
                    item.documentation = new vscode.MarkdownString(method.description);
                    
                    const snippetParams = method.parameters.filter(p => !p.optional).map((p, i) => `\${${i + 1}:${p.name}}`).join(', ');
                    item.insertText = new vscode.SnippetString(`${method.name}(${snippetParams})`);
                    
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
     * Resolve an import path to a file system path (matching Polyloft interpreter logic)
     */
    private async resolveImportPath(
        document: vscode.TextDocument,
        importPath: string
    ): Promise<vscode.Uri | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        // Convert dot notation to path: math.vector -> math/vector
        const rel = importPath.replace(/\./g, '/');
        const basePath = workspaceFolder.uri.fsPath;
        const possiblePaths: string[] = [];
        
        // If we have a current file context, try relative imports from current directory first
        const currentDir = path.dirname(document.uri.fsPath);
        possiblePaths.push(
            path.join(currentDir, rel + '.pf'),                           // same directory: helper.pf
            path.join(currentDir, rel, 'index.pf'),                       // subdirectory with index
            path.join(currentDir, rel, path.basename(rel) + '.pf')        // subdirectory/subdirectory.pf
        );
        
        // Standard library paths
        possiblePaths.push(
            // libs directory
            path.join(basePath, 'libs', rel + '.pf'),                     // libs/math/vector.pf (single file)
            path.join(basePath, 'libs', rel, 'index.pf'),                 // libs/math/vector/index.pf (public API aggregator)
            path.join(basePath, 'libs', rel, path.basename(rel) + '.pf'), // libs/math/vector/vector.pf
            // src directory
            path.join(basePath, 'src', rel + '.pf'),
            path.join(basePath, 'src', rel, 'index.pf')
        );
        
        // Try global library paths (~/.polyloft/)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const globalLib = path.join(homeDir, '.polyloft', 'libs');
            const globalSrc = path.join(homeDir, '.polyloft', 'src');
            
            possiblePaths.push(
                path.join(globalLib, rel + '.pf'),
                path.join(globalLib, rel, 'index.pf'),
                path.join(globalLib, rel, path.basename(rel) + '.pf'),
                path.join(globalSrc, rel + '.pf'),
                path.join(globalSrc, rel, 'index.pf')
            );
        }

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

    /**
     * Enhanced: Provide useful code snippets for common patterns
     */
    private provideEnhancedSnippets(): vscode.CompletionItem[] {
        const snippets: vscode.CompletionItem[] = [];

        // Class with constructor
        const classSnippet = new vscode.CompletionItem('class', vscode.CompletionItemKind.Snippet);
        classSnippet.insertText = new vscode.SnippetString(
            'class ${1:ClassName}:\n' +
            '\tlet ${2:field}\n' +
            '\t\n' +
            '\tdef init(${3:params}):\n' +
            '\t\tthis.${2:field} = ${3:params}\n' +
            '\tend\n' +
            '\t\n' +
            '\tdef ${4:methodName}():\n' +
            '\t\t${0}\n' +
            '\tend\n' +
            'end'
        );
        classSnippet.detail = 'Create a class with constructor';
        classSnippet.documentation = new vscode.MarkdownString('Creates a complete class with fields, constructor, and a method');
        snippets.push(classSnippet);

        // Record
        const recordSnippet = new vscode.CompletionItem('record', vscode.CompletionItemKind.Snippet);
        recordSnippet.insertText = new vscode.SnippetString(
            'record ${1:Name}(${2:field1}: ${3:Type1}, ${4:field2}: ${5:Type2})\n' +
            '\tdef ${6:methodName}():\n' +
            '\t\t${0}\n' +
            '\tend\n' +
            'end'
        );
        recordSnippet.detail = 'Create a record with fields and method';
        recordSnippet.documentation = new vscode.MarkdownString('Creates an immutable record type with automatic constructor');
        snippets.push(recordSnippet);

        // Enum
        const enumSnippet = new vscode.CompletionItem('enum', vscode.CompletionItemKind.Snippet);
        enumSnippet.insertText = new vscode.SnippetString(
            'enum ${1:Name}\n' +
            '\t${2:VALUE1}\n' +
            '\t${3:VALUE2}\n' +
            '\t${4:VALUE3}\n' +
            'end'
        );
        enumSnippet.detail = 'Create an enumeration';
        enumSnippet.documentation = new vscode.MarkdownString('Creates an enum with multiple values');
        snippets.push(enumSnippet);

        // Function
        const funcSnippet = new vscode.CompletionItem('def', vscode.CompletionItemKind.Snippet);
        funcSnippet.insertText = new vscode.SnippetString(
            'def ${1:functionName}(${2:params})${3: -> ${4:ReturnType}}:\n' +
            '\t${0}\n' +
            'end'
        );
        funcSnippet.detail = 'Create a function';
        funcSnippet.documentation = new vscode.MarkdownString('Creates a function with parameters and optional return type');
        snippets.push(funcSnippet);

        // For loop with where
        const forWhereSnippet = new vscode.CompletionItem('for where', vscode.CompletionItemKind.Snippet);
        forWhereSnippet.insertText = new vscode.SnippetString(
            'for ${1:item} in ${2:collection} where ${3:condition}:\n' +
            '\t${0}\n' +
            'end'
        );
        forWhereSnippet.detail = 'For loop with where clause';
        forWhereSnippet.documentation = new vscode.MarkdownString('Creates a for loop with a filtering where clause');
        snippets.push(forWhereSnippet);

        // For range
        const forRangeSnippet = new vscode.CompletionItem('for range', vscode.CompletionItemKind.Snippet);
        forRangeSnippet.insertText = new vscode.SnippetString(
            'for ${1:i} in ${2:0}...${3:10}:\n' +
            '\t${0}\n' +
            'end'
        );
        forRangeSnippet.detail = 'For loop with range';
        forRangeSnippet.documentation = new vscode.MarkdownString('Creates a for loop iterating over a range (use ... for inclusive range)');
        snippets.push(forRangeSnippet);

        // If-elif-else
        const ifElseSnippet = new vscode.CompletionItem('if else', vscode.CompletionItemKind.Snippet);
        ifElseSnippet.insertText = new vscode.SnippetString(
            'if ${1:condition}:\n' +
            '\t${2}\n' +
            'elif ${3:condition}:\n' +
            '\t${4}\n' +
            'else:\n' +
            '\t${0}\n' +
            'end'
        );
        ifElseSnippet.detail = 'If-elif-else statement';
        ifElseSnippet.documentation = new vscode.MarkdownString('Creates a complete if-elif-else conditional');
        snippets.push(ifElseSnippet);

        // Try-catch-finally
        const tryCatchSnippet = new vscode.CompletionItem('try catch', vscode.CompletionItemKind.Snippet);
        tryCatchSnippet.insertText = new vscode.SnippetString(
            'try:\n' +
            '\t${1:// risky operation}\n' +
            'catch ${2:error}:\n' +
            '\t${3:// handle error}\n' +
            'finally:\n' +
            '\t${0:// cleanup}\n' +
            'end'
        );
        tryCatchSnippet.detail = 'Try-catch-finally block';
        tryCatchSnippet.documentation = new vscode.MarkdownString('Creates a complete error handling block');
        snippets.push(tryCatchSnippet);

        // Switch statement
        const switchSnippet = new vscode.CompletionItem('switch', vscode.CompletionItemKind.Snippet);
        switchSnippet.insertText = new vscode.SnippetString(
            'switch ${1:value}:\n' +
            '\tcase ${2:value1}:\n' +
            '\t\t${3}\n' +
            '\tcase ${4:value2}:\n' +
            '\t\t${5}\n' +
            '\tdefault:\n' +
            '\t\t${0}\n' +
            'end'
        );
        switchSnippet.detail = 'Switch statement';
        switchSnippet.documentation = new vscode.MarkdownString('Creates a switch-case statement with default');
        snippets.push(switchSnippet);

        // Main function template
        const mainSnippet = new vscode.CompletionItem('main', vscode.CompletionItemKind.Snippet);
        mainSnippet.insertText = new vscode.SnippetString(
            '// Main entry point\n' +
            'def main():\n' +
            '\t${0:println("Hello, Polyloft!")}\n' +
            'end\n' +
            '\n' +
            'main()'
        );
        mainSnippet.detail = 'Main function template';
        mainSnippet.documentation = new vscode.MarkdownString('Creates a main function as entry point');
        snippets.push(mainSnippet);

        // Import statement
        const importSnippet = new vscode.CompletionItem('import', vscode.CompletionItemKind.Snippet);
        importSnippet.insertText = new vscode.SnippetString(
            'import ${1:module.name} { ${2:Symbol1}, ${3:Symbol2} }'
        );
        importSnippet.detail = 'Import statement';
        importSnippet.documentation = new vscode.MarkdownString('Imports specific symbols from a module');
        snippets.push(importSnippet);

        // String interpolation
        const stringInterpSnippet = new vscode.CompletionItem('println interpolation', vscode.CompletionItemKind.Snippet);
        stringInterpSnippet.insertText = new vscode.SnippetString(
            'println("${1:text}: #{${2:variable}}")'
        );
        stringInterpSnippet.detail = 'Print with string interpolation';
        stringInterpSnippet.documentation = new vscode.MarkdownString('Prints text with interpolated values using #{expression} syntax');
        snippets.push(stringInterpSnippet);

        // Interface
        const interfaceSnippet = new vscode.CompletionItem('interface', vscode.CompletionItemKind.Snippet);
        interfaceSnippet.insertText = new vscode.SnippetString(
            'interface ${1:Name}:\n' +
            '\t${2:methodName}(${3:params}) -> ${4:ReturnType}\n' +
            'end'
        );
        interfaceSnippet.detail = 'Create an interface';
        interfaceSnippet.documentation = new vscode.MarkdownString('Creates an interface definition');
        snippets.push(interfaceSnippet);

        // @Override annotation
        const overrideSnippet = new vscode.CompletionItem('@Override', vscode.CompletionItemKind.Snippet);
        overrideSnippet.insertText = new vscode.SnippetString(
            '@Override\n' +
            'def ${1:methodName}(${2:params}):\n' +
            '\t${0}\n' +
            'end'
        );
        overrideSnippet.detail = '@Override annotation with method';
        overrideSnippet.documentation = new vscode.MarkdownString('Creates an override method with annotation');
        snippets.push(overrideSnippet);

        // Thread spawn
        const threadSnippet = new vscode.CompletionItem('thread spawn', vscode.CompletionItemKind.Snippet);
        threadSnippet.insertText = new vscode.SnippetString(
            'thread spawn do\n' +
            '\t${0}\n' +
            'end'
        );
        threadSnippet.detail = 'Spawn a thread';
        threadSnippet.documentation = new vscode.MarkdownString('Creates a background thread');
        snippets.push(threadSnippet);

        // Async promise
        const asyncSnippet = new vscode.CompletionItem('async await', vscode.CompletionItemKind.Snippet);
        asyncSnippet.insertText = new vscode.SnippetString(
            'let promise = async(() => do\n' +
            '\t${1:// async code}\n' +
            '\treturn ${2:result}\n' +
            'end)\n' +
            'let ${3:result} = promise.await()'
        );
        asyncSnippet.detail = 'Async/await pattern';
        asyncSnippet.documentation = new vscode.MarkdownString('Creates async promise with await');
        snippets.push(asyncSnippet);

        return snippets;
    }
}
