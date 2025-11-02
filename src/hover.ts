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
        }

        const text = document.getText();
        const lines = text.split('\n');

        // Check for methods accessed via dot notation (both builtin and user-defined)
        const memberMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (memberMatch && memberMatch[2] === word) {
            const objectName = memberMatch[1];
            
            // First check if it's a direct builtin package reference (like Sys.println)
            if (this.builtinPackages && this.builtinPackages.packages[objectName]) {
                const pkg = this.builtinPackages.packages[objectName];
                
                // Check functions
                if (pkg.functions) {
                    for (const func of pkg.functions) {
                        if (func.name === word) {
                            const params = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
                            
                            const markdown = new vscode.MarkdownString();
                            markdown.appendCodeblock(`${objectName}.${func.name}(${params}) -> ${func.returnType}`, 'polyloft');
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
                            markdown.appendCodeblock(`${objectName}.${constant.name}: ${constant.type} = ${constant.value}`, 'polyloft');
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
                            markdown.appendCodeblock(`${objectName}.${method.name}(${params}) -> ${method.returnType}`, 'polyloft');
                            markdown.appendMarkdown('\n\n' + method.description);
                            markdown.appendMarkdown('\n\n*Built-in method*');
                            
                            return new vscode.Hover(markdown);
                        }
                    }
                }
            }
            
            // Infer the type of the object for variable instances
            const objectType = this.inferVariableType(text, objectName);
            
            if (objectType && objectType !== 'Any') {
                // Check if it's a builtin type (String, Array, Map, Set, etc.)
                if (this.builtinPackages && this.builtinPackages.packages[objectType]) {
                    const pkg = this.builtinPackages.packages[objectType];
                    
                    if (pkg.methods) {
                        for (const method of pkg.methods) {
                            if (method.name === word) {
                                const params = method.parameters.map(p => {
                                    const optional = p.optional ? '?' : '';
                                    return `${p.name}${optional}: ${p.type}`;
                                }).join(', ');
                                
                                const markdown = new vscode.MarkdownString();
                                markdown.appendCodeblock(`${objectType}.${word}(${params}) -> ${method.returnType}`, 'polyloft');
                                markdown.appendMarkdown('\n\n' + method.description);
                                markdown.appendMarkdown('\n\n*Built-in method*');
                                
                                return new vscode.Hover(markdown);
                            }
                        }
                    }
                }
                
                // Find the class definition for user-defined types
                const classRegex = new RegExp(`class\\s+${objectType}\\s+[^]*?end`, 'g');
                const classMatch = classRegex.exec(text);
                
                if (classMatch) {
                    const classBody = classMatch[0];
                    
                    // Look for the method in the class
                    const methodRegex = new RegExp(`def\\s+${word}\\s*\\(([^)]*)\\)(?:\\s*->\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*))?`, 'g');
                    const methodMatch = methodRegex.exec(classBody);
                    
                    if (methodMatch) {
                        const params = methodMatch[1] || '';
                        const returnType = methodMatch[2] || 'Void';
                        
                        const markdown = new vscode.MarkdownString();
                        markdown.appendCodeblock(`${objectType}.${word}(${params}) -> ${returnType}`, 'polyloft');
                        
                        // Try to find comments before the method
                        const methodIndex = classBody.indexOf(methodMatch[0]);
                        const methodLineNum = classBody.substring(0, methodIndex).split('\n').length - 1;
                        const classLines = classBody.split('\n');
                        const methodComments = this.getPrecedingComments(classLines, methodLineNum);
                        if (methodComments) {
                            markdown.appendMarkdown('\n\n' + methodComments);
                        }
                        
                        markdown.appendMarkdown('\n\n*Method of class ' + objectType + '*');
                        
                        return new vscode.Hover(markdown);
                    }
                }
            }
        }

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
            
            // Try to find constructor (init method) and show its signature
            const constructorInfo = this.getClassConstructorInfo(text, word, lineNum);
            if (constructorInfo) {
                markdown.appendMarkdown('\n\n**Constructor:**\n');
                markdown.appendCodeblock(constructorInfo, 'polyloft');
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
        const varRegex = new RegExp(`(?:var|let|const|final)\\s+${word}\\s*(?::\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*))?(?:\\s*=\\s*(.+))?`, 'g');
        const varMatch = varRegex.exec(text);
        
        if (varMatch) {
            let varType = varMatch[1]; // Explicit type annotation
            const lineNum = this.getLineNumber(text, varMatch.index);
            
            // If no explicit type, infer from value
            if (!varType) {
                varType = this.inferVariableType(text, word);
            }
            
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

    /**
     * Infer the type of a variable from its declaration in the text
     */
    private inferVariableType(text: string, varName: string): string {
        // Escape special regex characters in variable name
        const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Build regex patterns once
        const explicitTypeRegex = new RegExp(`(?:var|let|const|final)\\s+${escapedVarName}\\s*:\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*)`);
        const constructorRegex = new RegExp(`(?:var|let|const|final)\\s+${escapedVarName}\\s*=\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\(`);
        const simpleAssignRegex = new RegExp(`(?:var|let|const|final)\\s+${escapedVarName}\\s*=\\s*(.+)`);
        
        const lines = text.split('\n');
        
        for (const line of lines) {
            // Explicit type annotation
            const explicitTypeMatch = line.match(explicitTypeRegex);
            if (explicitTypeMatch) {
                return explicitTypeMatch[1].trim();
            }
            
            // Constructor call - infer type from class instantiation
            const constructorMatch = line.match(constructorRegex);
            if (constructorMatch) {
                return constructorMatch[1];
            }
            
            // Simple assignment without explicit type
            const simpleAssignMatch = line.match(simpleAssignRegex);
            if (simpleAssignMatch) {
                const value = simpleAssignMatch[1].trim();
                const inferredType = this.inferTypeFromValue(value);
                if (inferredType) {
                    return inferredType;
                }
            }
        }
        
        return 'Any';
    }

    /**
     * Infer type from a value expression
     */
    private inferTypeFromValue(value: string): string | undefined {
        // Remove trailing semicolon
        value = value.replace(/;$/, '').trim();
        
        // String literals
        if (value.match(/^["'].*["']$/)) {
            return 'String';
        }
        
        // Numeric literals
        if (value.match(/^\d+$/)) {
            return 'Int';
        }
        if (value.match(/^\d+\.\d+$/)) {
            return 'Float';
        }
        
        // Boolean literals
        if (value === 'true' || value === 'false') {
            return 'Bool';
        }
        
        // Nil/null
        if (value === 'nil' || value === 'null') {
            return 'Nil';
        }
        
        // Array literals
        if (value.match(/^\[.*\]$/)) {
            return 'Array';
        }
        
        // Map literals
        if (value.match(/^\{.*\}$/)) {
            return 'Map';
        }
        
        // Constructor calls
        const constructorMatch = value.match(/^([A-Z][a-zA-Z0-9_]*)\s*\(/);
        if (constructorMatch) {
            return constructorMatch[1];
        }
        
        return undefined;
    }

    /**
     * Get constructor (init method) information for a class
     */
    private getClassConstructorInfo(text: string, className: string, classStartLine: number): string | null {
        const lines = text.split('\n');
        
        // Find the class body
        let depth = 0;
        let inClass = false;
        
        for (let i = classStartLine; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.match(/:\s*$/)) {
                depth++;
                inClass = true;
            }
            
            if (inClass) {
                // Look for init method
                const initMatch = line.match(/^\s*(?:(?:public|private|protected)\s+)?def\s+init\s*\(([^)]*)\)/);
                if (initMatch) {
                    const params = initMatch[1] || '';
                    return `${className}(${params})`;
                }
            }
            
            if (line.match(/^\s*end\s*$/)) {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
        }
        
        return null;
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
     * Enhanced to handle classes, generics, function calls, and complex expressions
     */
    private inferFunctionReturnType(lines: string[], funcStartLine: number): string {
        // Find the function body (from funcStartLine to matching 'end')
        let blockLevel = 1;
        let returnTypes = new Set<string>();
        let hasReturn = false;
        
        // First, collect all variable types and class definitions in scope
        const scopeTypes = this.collectScopeTypes(lines);
        
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
                
                const inferredType = this.inferExpressionType(returnValue, scopeTypes, lines);
                if (inferredType) {
                    returnTypes.add(inferredType);
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
     * Collect type information from the document (classes, variables, etc.)
     */
    private collectScopeTypes(lines: string[]): Map<string, string> {
        const types = new Map<string, string>();
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Collect class definitions
            const classMatch = line.match(/^\s*class\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classMatch) {
                types.set(classMatch[1], classMatch[1]);
            }
            
            // Collect record definitions
            const recordMatch = line.match(/^\s*record\s+([A-Z][a-zA-Z0-9_]*)/);
            if (recordMatch) {
                types.set(recordMatch[1], recordMatch[1]);
            }
            
            // Collect enum definitions
            const enumMatch = line.match(/^\s*enum\s+([A-Z][a-zA-Z0-9_]*)/);
            if (enumMatch) {
                types.set(enumMatch[1], enumMatch[1]);
            }
            
            // Collect variable declarations with types
            const varMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z][a-zA-Z0-9_<>,\s|]*)/);
            if (varMatch) {
                types.set(varMatch[1], varMatch[2].trim());
            }
            
            // Collect function definitions with return types
            const funcMatch = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)(?:\s*->\s*([a-zA-Z][a-zA-Z0-9_<>,\s|]*))?/);
            if (funcMatch && funcMatch[2]) {
                types.set(funcMatch[1], funcMatch[2].trim());
            }
        }
        
        return types;
    }

    /**
     * Enhanced type inference for complex expressions
     */
    private inferExpressionType(expr: string, scopeTypes: Map<string, string>, lines: string[]): string {
        expr = expr.trim();
        
        // Remove trailing semicolon if present
        if (expr.endsWith(';')) {
            expr = expr.slice(0, -1).trim();
        }
        
        // String literals
        if (expr.match(/^["'].*["']$/)) {
            return 'String';
        }
        
        // Numeric literals
        if (expr.match(/^\d+$/)) {
            return 'Int';
        }
        if (expr.match(/^\d+\.\d+$/)) {
            return 'Float';
        }
        
        // Boolean literals
        if (expr === 'true' || expr === 'false') {
            return 'Bool';
        }
        
        // Nil/null
        if (expr === 'nil' || expr === 'null') {
            return 'Nil';
        }
        
        // Array literals with enhanced type inference
        if (expr.match(/^\[.*\]$/)) {
            return this.inferArrayType(expr);
        }
        
        // Object/Map literals
        if (expr.match(/^\{.*\}$/)) {
            return this.inferObjectType(expr);
        }
        
        // Constructor calls (ClassName(...))
        const constructorMatch = expr.match(/^([A-Z][a-zA-Z0-9_]*)\s*\(/);
        if (constructorMatch) {
            const className = constructorMatch[1];
            return className;
        }
        
        // Function calls - try to find return type
        const funcCallMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (funcCallMatch) {
            const funcName = funcCallMatch[1];
            if (scopeTypes.has(funcName)) {
                return scopeTypes.get(funcName)!;
            }
            
            // Try to find the function definition and infer its return type
            const funcDefMatch = this.findFunctionDefinition(funcName, lines);
            if (funcDefMatch) {
                return funcDefMatch;
            }
        }
        
        // Method calls (object.method())
        const methodCallMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (methodCallMatch) {
            const objectName = methodCallMatch[1];
            const methodName = methodCallMatch[2];
            
            // Check if we know the object's type
            if (scopeTypes.has(objectName)) {
                const objectType = scopeTypes.get(objectName)!;
                return this.inferMethodReturnType(objectType, methodName);
            }
        }
        
        // Variable references
        if (expr.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            if (scopeTypes.has(expr)) {
                return scopeTypes.get(expr)!;
            }
        }
        
        // Arithmetic operations
        if (expr.match(/[\+\-\*\/\%]/)) {
            return this.inferArithmeticType(expr, scopeTypes);
        }
        
        // Comparison operations
        if (expr.match(/[<>]=?|[!=]=|&&|\|\|/)) {
            return 'Bool';
        }
        
        // String concatenation
        if (expr.includes('+') && (expr.includes('"') || expr.includes("'"))) {
            return 'String';
        }
        
        return 'Any';
    }

    /**
     * Infer array type from array literal
     */
    private inferArrayType(arrayExpr: string): string {
        const content = arrayExpr.slice(1, -1).trim();
        if (content.length === 0) {
            return 'Array';
        }
        
        // Simple split by comma (doesn't handle nested arrays perfectly)
        const elements = this.splitByComma(content);
        if (elements.length === 0) {
            return 'Array';
        }
        
        // Check element types
        const elementTypes = new Set<string>();
        for (const elem of elements) {
            const trimmed = elem.trim();
            if (trimmed.match(/^\d+$/)) {
                elementTypes.add('Int');
            } else if (trimmed.match(/^\d+\.\d+$/)) {
                elementTypes.add('Float');
            } else if (trimmed.match(/^["'].*["']$/)) {
                elementTypes.add('String');
            } else if (trimmed === 'true' || trimmed === 'false') {
                elementTypes.add('Bool');
            } else if (trimmed.match(/^\{.*\}$/)) {
                elementTypes.add('Map');
            } else {
                elementTypes.add('Any');
            }
        }
        
        // If all same type, return Array<Type>
        if (elementTypes.size === 1) {
            const elemType = Array.from(elementTypes)[0];
            return `Array<${elemType}>`;
        }
        
        return 'Array<Any>';
    }

    /**
     * Infer object/map type from literal
     */
    private inferObjectType(objExpr: string): string {
        const content = objExpr.slice(1, -1).trim();
        
        // Check if it has key:value pairs (Map) or just values
        if (content.includes(':')) {
            return 'Map';
        }
        
        return 'Map';
    }

    /**
     * Split string by comma, respecting brackets and quotes
     */
    private splitByComma(str: string): string[] {
        const result: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            
            // Check for quotes, but handle escaped quotes properly
            if (char === '"' || char === "'") {
                // Count preceding backslashes
                let backslashCount = 0;
                let j = i - 1;
                while (j >= 0 && str[j] === '\\') {
                    backslashCount++;
                    j--;
                }
                
                // If even number of backslashes (including 0), the quote is not escaped
                if (backslashCount % 2 === 0) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                    }
                }
            }
            
            if (!inString) {
                if (char === '[' || char === '{' || char === '(') {
                    depth++;
                } else if (char === ']' || char === '}' || char === ')') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    result.push(current.trim());
                    current = '';
                    continue;
                }
            }
            
            current += char;
        }
        
        if (current.trim().length > 0) {
            result.push(current.trim());
        }
        
        return result;
    }

    /**
     * Find function definition and return its return type
     */
    private findFunctionDefinition(funcName: string, lines: string[]): string | undefined {
        const funcRegex = new RegExp(`def\\s+${funcName}\\s*\\([^)]*\\)(?:\\s*->\\s*([a-zA-Z][a-zA-Z0-9_<>,\\s|]*))?\\s*:`);
        
        for (const line of lines) {
            const match = line.match(funcRegex);
            if (match) {
                if (match[1]) {
                    return match[1].trim();
                }
                // If no explicit return type, we could recursively infer it
                // but that might be too expensive, so return Any for now
                return 'Any';
            }
        }
        
        return undefined;
    }

    /**
     * Infer method return type based on object type and method name
     */
    private inferMethodReturnType(objectType: string, methodName: string): string {
        // Built-in types and their common methods
        const builtinMethods: { [key: string]: { [method: string]: string } } = {
            'String': {
                'length': 'Int',
                'substring': 'String',
                'toLowerCase': 'String',
                'toUpperCase': 'String',
                'trim': 'String',
                'split': 'Array<String>',
                'replace': 'String',
                'indexOf': 'Int',
                'charAt': 'String',
                'concat': 'String',
                'toString': 'String'
            },
            'Array': {
                'length': 'Int',
                'push': 'Void',
                'pop': 'Any',
                'shift': 'Any',
                'unshift': 'Void',
                'concat': 'Array',
                'slice': 'Array',
                'toString': 'String',
                'get': 'Any'
            },
            'Map': {
                'get': 'Any',
                'set': 'Void',
                'has': 'Bool',
                'hasKey': 'Bool',
                'keys': 'Array<String>',
                'values': 'Array<Any>',
                'size': 'Int',
                'toString': 'String'
            },
            'Set': {
                'add': 'Void',
                'has': 'Bool',
                'delete': 'Bool',
                'size': 'Int',
                'toString': 'String'
            }
        };
        
        // Check if it's a generic type like Array<Int> or Map<String, Any>
        const genericMatch = objectType.match(/^([A-Z][a-zA-Z0-9_]*)</);
        const baseType = genericMatch ? genericMatch[1] : objectType;
        
        if (builtinMethods[baseType] && builtinMethods[baseType][methodName]) {
            let returnType = builtinMethods[baseType][methodName];
            
            // For generic arrays, preserve element type in methods that return array elements
            if (baseType === 'Array' && methodName === 'get') {
                const elementTypeMatch = objectType.match(/Array<(.+)>/);
                if (elementTypeMatch) {
                    return elementTypeMatch[1];
                }
            }
            
            return returnType;
        }
        
        return 'Any';
    }

    /**
     * Infer type from arithmetic expressions
     */
    private inferArithmeticType(expr: string, scopeTypes: Map<string, string>): string {
        // Simple heuristic: if expression contains float, result is float
        if (expr.match(/\d+\.\d+/)) {
            return 'Float';
        }
        
        // If only integers and arithmetic operators (including single numbers), result is int
        if (expr.match(/^[\d+\-*/%\s()]+$/)) {
            return 'Int';
        }
        
        // Check if any variables in expression are Float
        const varMatches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
        if (varMatches) {
            for (const varName of varMatches) {
                if (scopeTypes.has(varName)) {
                    const varType = scopeTypes.get(varName)!;
                    if (varType === 'Float' || varType === 'Double') {
                        return 'Float';
                    }
                }
            }
        }
        
        // Default to Int for arithmetic
        return 'Int';
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
